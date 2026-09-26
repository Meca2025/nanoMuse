"""How a code reaches the person: the log (development), SMTP, or Aliyun SMS.

`send(identifier, code)` raises `SendError` when the message could not go out
so the API can say so instead of letting the user wait for nothing.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import smtplib
import time
import urllib.parse
import uuid
from email.message import EmailMessage
from typing import Protocol

import httpx

from .config import Settings
from .identifiers import Identifier

log = logging.getLogger("nanomuse_cloud.send")


class SendError(RuntimeError):
    pass


class CodeSender(Protocol):
    def send(self, ident: Identifier, code: str) -> None: ...


class LogSender:
    """Development: the code goes to the log, and stays reachable for tests."""

    def __init__(self) -> None:
        self.sent: list[tuple[Identifier, str]] = []

    def send(self, ident: Identifier, code: str) -> None:
        self.sent.append((ident, code))
        log.warning("verification code for %s (%s): %s", ident.hint, ident.channel, code)


class SmtpSender:
    def __init__(self, s: Settings) -> None:
        if not (s.smtp_host and s.smtp_from):
            raise ValueError("SMTP_HOST and SMTP_FROM are required for CODE_SENDER=smtp")
        self.s = s

    def send(self, ident: Identifier, code: str) -> None:
        if ident.channel != "email":
            raise SendError("this deployment sends codes by e-mail only")
        msg = EmailMessage()
        msg["From"] = self.s.smtp_from
        msg["To"] = ident.value
        msg["Subject"] = f"nanoMuse 验证码 {code}"
        msg.set_content(
            f"你的 nanoMuse 验证码是 {code}，{self.s.code_ttl_s // 60} 分钟内有效。\n"
            f"Your nanoMuse code is {code}; it expires in {self.s.code_ttl_s // 60} minutes.\n\n"
            "如果这不是你本人的操作，忽略这封邮件即可。"
        )
        try:
            if self.s.smtp_port == 465:
                server = smtplib.SMTP_SSL(self.s.smtp_host, self.s.smtp_port, timeout=20)
            else:
                server = smtplib.SMTP(self.s.smtp_host, self.s.smtp_port, timeout=20)
                server.starttls()
            with server:
                if self.s.smtp_user:
                    server.login(self.s.smtp_user, self.s.smtp_password)
                server.send_message(msg)
        except (smtplib.SMTPException, OSError) as e:
            log.error("smtp send failed: %s", e)
            raise SendError("mail") from e


class AliyunSmsSender:
    """Dysmsapi SendSms, signed the RPC way (HMAC-SHA1), no SDK.

    The template must take one variable named `code`, e.g. 「您的验证码为
    ${code}，10分钟内有效。」. Mainland numbers are sent without +86, others
    with the country code and no plus, as the API expects.
    """

    ENDPOINT = "https://dysmsapi.aliyuncs.com/"

    def __init__(self, s: Settings) -> None:
        if not (s.aliyun_access_key_id and s.aliyun_access_key_secret and s.aliyun_sms_sign and s.aliyun_sms_template):
            raise ValueError("ALIYUN_ACCESS_KEY_ID/SECRET, ALIYUN_SMS_SIGN and ALIYUN_SMS_TEMPLATE are required for CODE_SENDER=aliyun")
        self.s = s

    @staticmethod
    def _pct(v: str) -> str:
        return urllib.parse.quote(v, safe="~")

    def _signed_query(self, params: dict[str, str]) -> str:
        canonical = "&".join(f"{self._pct(k)}={self._pct(v)}" for k, v in sorted(params.items()))
        string_to_sign = "GET&%2F&" + self._pct(canonical)
        digest = hmac.new((self.s.aliyun_access_key_secret + "&").encode(), string_to_sign.encode(), hashlib.sha1).digest()
        signature = base64.b64encode(digest).decode()
        return canonical + "&Signature=" + self._pct(signature)

    def send(self, ident: Identifier, code: str) -> None:
        if ident.channel != "phone":
            raise SendError("this deployment sends codes by SMS only")
        number = ident.value[3:] if ident.value.startswith("+86") else ident.value.lstrip("+")
        params = {
            "AccessKeyId": self.s.aliyun_access_key_id,
            "Action": "SendSms",
            "Format": "JSON",
            "PhoneNumbers": number,
            "SignName": self.s.aliyun_sms_sign,
            "SignatureMethod": "HMAC-SHA1",
            "SignatureNonce": uuid.uuid4().hex,
            "SignatureVersion": "1.0",
            "TemplateCode": self.s.aliyun_sms_template,
            "TemplateParam": json.dumps({"code": code}),
            "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "Version": "2017-05-25",
        }
        url = self.ENDPOINT + "?" + self._signed_query(params)
        try:
            r = httpx.get(url, timeout=15)
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            log.error("aliyun sms request failed: %s", e)
            raise SendError("sms") from e
        if body.get("Code") != "OK":
            log.error("aliyun sms rejected: %s %s", body.get("Code"), body.get("Message"))
            raise SendError("sms")


def make_sender(s: Settings) -> CodeSender:
    if s.sender == "log":
        return LogSender()
    if s.sender == "smtp":
        return SmtpSender(s)
    if s.sender == "aliyun":
        return AliyunSmsSender(s)
    if s.sender == "both":
        return BothSender(SmtpSender(s), AliyunSmsSender(s))
    raise ValueError(f"unknown CODE_SENDER {s.sender!r}")


class BothSender:
    """SMS for phones, mail for addresses — the normal production setup."""

    def __init__(self, mail: SmtpSender, sms: AliyunSmsSender) -> None:
        self.mail, self.sms = mail, sms

    def send(self, ident: Identifier, code: str) -> None:
        (self.sms if ident.channel == "phone" else self.mail).send(ident, code)
