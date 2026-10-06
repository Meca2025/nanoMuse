"""Build the configured LLM."""

from __future__ import annotations

from pathlib import Path

from nanomuse.config import CHATGPT_PROVIDER, LLMSettings, resolve_provider
from nanomuse.llm.base import BaseLLM
from nanomuse.llm.openai_chat import OpenAIChatLLM
from nanomuse.llm.openai_responses import OpenAIResponsesLLM
from nanomuse.llm.prompt_tools import PromptToolAdapter


def create_llm(settings: LLMSettings, data_dir: Path | None = None) -> BaseLLM:
    """The client for a model slot. ``provider`` is a protocol (``openai``,
    ``openai_responses``), ``chatgpt`` (the sign-in; ``data_dir`` says where its token store
    is) or a catalogue id, which resolves to a protocol and the entry's endpoint."""
    protocol, base_url = resolve_provider(settings.provider, settings.base_url)
    if protocol == CHATGPT_PROVIDER:
        from nanomuse.llm.codex import CodexLLM

        llm: BaseLLM = CodexLLM(settings, data_dir=data_dir)
    else:
        if base_url != settings.base_url:
            settings = settings.model_copy(update={"base_url": base_url})
        if protocol == "openai":
            llm = OpenAIChatLLM(settings)
        elif protocol == "openai_responses":
            llm = OpenAIResponsesLLM(settings)
        else:  # pragma: no cover - guarded by the provider validator
            raise ValueError(f"unknown llm provider: {settings.provider}")
    if settings.tool_mode == "prompt":
        llm = PromptToolAdapter(llm)
    elif settings.tool_mode == "auto":
        llm = PromptToolAdapter(llm, native_first=True)
    return llm


__all__ = ["create_llm"]
