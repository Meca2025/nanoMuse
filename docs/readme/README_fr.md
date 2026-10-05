<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/assets/brand/nanomuse-cover.png" alt="nanoMuse — an open-source personal agent for every device you own">
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README.md">English</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_zh.md">简体中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_zh-TW.md">繁體中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_es.md">Español</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_fr.md">Français</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_id.md">Bahasa Indonesia</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ja.md">日本語</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ko.md">한국어</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_ru.md">Русский</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/docs/readme/README_vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Étoiles GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Téléchargements"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/Essayer%20dans%20le%20navigateur-nanomuse.cn%2Fweb-5B4EE6" alt="Essayer dans le navigateur"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/Site%20web-nanomuse.cn-0a66e4" alt="Site web"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **Gratuit, open source, à but non lucratif.** Connectez-vous avec un numéro de téléphone ou une adresse e-mail et vous recevez un crédit de départ ; c'est le développeur qui le paie. La page du compte indique ce qu'il reste et comment en ajouter. Quand il est épuisé, utilisez votre propre clé : Alibaba Cloud Bailian en Chine continentale, OpenRouter ailleurs ([comment](../own-key.md)). Les messages ne sont pas conservés par défaut et rien n'est vendu ([politique de confidentialité](https://nanomuse.cn/privacy/)) ; supprimez le compte quand vous voulez. **[Essayez-le dans le navigateur](https://nanomuse.cn/web/)** ou [téléchargez l'application](https://github.com/nano-muse/nanoMuse/releases/latest).

> Cette page est une traduction du [README anglais](../../README.md), qui fait référence et contient les actualités et le tableau complet des versions.

nanoMuse est un agent personnel open source pour chacun de vos appareils : un seul agent avec un nom et une apparence à lui, comme le [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) de Meta, qui fait les choses au lieu de répondre à des questions, continue de travailler quand l'application est fermée, se souvient de vous et s'arrête pour demander avant tout ce que vous ne pourriez pas annuler. L'application Android fait tourner l'agent entier **sur le téléphone** : un système de fichiers Linux, un shell, un navigateur, MCP, des compétences et des tâches planifiées dans l'APK, avec un modèle que vous apportez. Elle a des mains pour les applications qui n'ont jamais eu d'API — l'écran même du téléphone, avec votre permission — et atteint votre ordinateur : dites-le sur le téléphone, c'est fait là-bas. L'application de bureau, la version web et l'application iPhone (TestFlight) sont là aussi ; les lunettes suivent. Votre propre clé ou un crédit de départ d'un relais ouvert, GPL-3.0 — et une base sur laquelle construire votre propre Muse.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="Le même petit dragon dans cinq états : au repos, au travail, en attente, content, désolé">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Discussion : avant de supprimer dans l'espace de travail, l'agent s'arrête et demande — une fois, cette discussion, toujours pour l'espace de travail, ou refuser">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Fil : des billets écrits pour vous ce matin">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Objectifs : suivis selon un calendrier, avec des routines">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Avatar : décrivez une apparence, votre modèle d'image la dessine, choisissez celle qui vous plaît">
</p>

## Pourquoi nanoMuse

Quatre choses définissent le projet.

| | |
|---|---|
| **À la manière de Muse** | Un agent, pas une boîte à outils : un nom et une apparence à lui, une première conversation, un fil écrit pour vous, des objectifs poursuivis en arrière-plan, une mémoire que vous pouvez lire et modifier, une approbation avant tout ce que vous ne pourriez pas annuler. |
| **Entièrement ouvert** | GPL-3.0-or-later, tout le dépôt. Aucun composant fermé, aucun compte ni serveur imposé, aucun modèle imposé — le relais optionnel nanoMuse Cloud est lui aussi dans le dépôt, et chacun peut en faire tourner un ; chaque version est construite depuis son tag et installée à la main. Muse, 豆包 et 千问 sont des produits qu'on vous donne ; nanoMuse est un produit que vous possédez — et une base pour construire votre propre Muse : renommez-le, redessinez-le, réécrivez sa personnalité, branchez vos propres modèles et outils. |
| **Toute application, avec ou sans API** | En Chine, une bonne part de la journée passe par des applications qui n'ont jamais eu d'API. L'agent monte les échelons un à un — une compétence, une CLI ou un serveur MCP d'abord, puis une page récupérée avec votre session, puis le navigateur intégré, et, quand vous le permettez, l'écran même de l'appareil, en regardant et en touchant comme vous le feriez — avec les mêmes approbations avant de payer, d'envoyer ou de supprimer. Désactivé par défaut. |
| **Chaque appareil** | Un agent, et chaque appareil que vous possédez est une paire de mains et une porte d'entrée : dites-le sur le téléphone, cela se fait sur votre PC ; dites-le à vos lunettes, cela se fait sur les deux. Le téléphone pilote déjà votre ordinateur, l'application de bureau, le web et l'application iPhone sont là ; les lunettes suivent. |

La comparaison avec Muse et avec OpenMinis, le runtime sur lequel l'application est construite : dans le [README anglais](../../README.md#compared-with-muse-and-openminis). Le plan et ses raisons : [docs/roadmap.md](../roadmap.md).

## Installation

Un premier aperçu sans rien installer : [nanomuse.cn/web](https://nanomuse.cn/web/) ouvre un téléphone simulé dans le navigateur avec un nanoMuse à lui, après une connexion par numéro de téléphone ou adresse e-mail et un code — une démo, loin des applications ; pour la version complète, l'application pour téléphone et celle de bureau ci-dessous, avec le même compte. Pour vos propres appareils, les [téléchargements](https://nanomuse.cn/#download) : l'APK Android, l'application de bureau pour Windows, macOS et Linux (`nanoMuse-Desktop-<version>-…`), le binaire en terminal (`nanomuse-desktop-terminal-<version>-…`), ou `pipx install "git+https://github.com/nano-muse/nanoMuse"` avec Python 3.11+. Dans nos mesures, GitHub est aussi la source la plus rapide depuis la Chine ; si les téléchargements échouent là où vous êtes, les mêmes fichiers sont sur le miroir du projet, [nanomuse.cn/dl](https://nanomuse.cn/dl/) (synchronisé dans le quart d'heure qui suit une version, vérifié par SHA-256) ; [docs/desktop.md](../desktop.md) et [docs/every-device.md](../every-device.md) expliquent comment ils se connectent entre eux. Sur le téléphone :

1. Téléchargez `nanoMuse-<version>-arm64.apk` depuis la [dernière version](https://github.com/nano-muse/nanoMuse/releases/latest) — Android 8.0 ou plus récent, un téléphone 64 bits. Vérifiez avec `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` si vous le souhaitez.
2. Ouvrez-le. Android demande une fois d'autoriser l'installation ; chaque version est signée avec la même clé, les mises à jour s'installent donc par-dessus la précédente et conservent vos données.
3. Connectez un modèle. *Se connecter — gratuit* : un numéro de téléphone (le code arrive par SMS) ou une adresse e-mail, et l'agent dispose d'un crédit gratuit sur [nanoMuse Cloud](../cloud.md) — pas de clé, rien à payer ; la page du compte dit ce qu'il reste et comment il augmente. Le modèle de conversation est `deepseek-v4.1-flash`, les mains utilisent `qwen3.8-27b` ; ce sont deux réglages distincts. Quand le crédit est épuisé, utilisez votre propre clé : [Alibaba Cloud Bailian](../own-key.md) en Chine continentale, [OpenRouter](../own-key.md) ailleurs (Bailian n'inscrit pas de comptes hors de Chine), n'importe quel point de terminaison compatible OpenAI, ou l'une des connexions OAuth livrées avec l'application. Ensuite, si vous le voulez, les deux autorisations qui laissent l'agent utiliser les applications de votre téléphone (facultatives), puis la première conversation, qui demande comment vous appeler et laisse l'agent choisir son propre nom.
4. Facultatif — *Réglages → Modèles d'image et de vidéo* : un modèle d'image (qwen-image-3.0 sur Alibaba Cloud Model Studio, gpt-image-1, ou tout fournisseur disposant du point de terminaison images d'OpenAI) permet à l'agent de changer d'apparence et de dessiner ; un modèle vidéo (wan2.2-i2v-flash sur Model Studio) anime l'apparence. Muse les a intégrés ; nanoMuse utilise les vôtres, et l'agent vous le dit quand il en manque un.

L'application vérifie les versions de ce dépôt pour les mises à jour ; l'application de bureau affiche sa version dans *Réglages → À propos*, avec un bouton *Rechercher des mises à jour*. Les notes de chaque version sont dans [docs/releases/](../releases) et le [CHANGELOG](../../CHANGELOG.md).

## Ce qu'il fait

| | |
|---|---|
| **Il agit** | Un shell Linux, un navigateur, des serveurs MCP, des compétences au format [Agent Skills](https://agentskills.io), et — quand vous activez les *Mains* — les applications de votre téléphone à travers leur écran : une capture, une action, une autre capture, avec une échelle qui essaie d'abord les API, une prise en main pour les connexions et les mêmes approbations. L'agent choisit la main qu'il faut et montre chaque étape sous forme de carte que vous pouvez ouvrir. Quand une page a besoin de vous — une connexion, un code — il s'arrête et vous passe la main ; *Terminé* reprend, sur le téléphone, le bureau et le web. Sur macOS, les mains peuvent piloter la fenêtre d'une seule application avec leurs propres événements, votre curseur reste donc le vôtre ; chaque application est demandée la première fois. |
| **Il demande d'abord** | Un arrêt avant de supprimer, d'envoyer ou de payer — dans le shell, dans le navigateur et sur l'écran du téléphone quand les Mains touchent — avec une approbation que vous limitez à une fois, à cette discussion, ou à toujours pour ce destinataire, ce domaine ou ce dossier, et que vous pouvez révoquer dans Autorisations. Les mots de passe et les codes de vérification, c'est toujours vous qui les tapez. Sur le bureau, *Autoriser une fois / Refuser* sont sur la scène en direct ; sur le téléphone, sur la capsule — vous répondez là où vous êtes, sans revenir dans l'application. |
| **Là où vous êtes déjà** | Parlez à votre Muse depuis 飞书, 钉钉, 企业微信 ou Telegram : le bot vit dans la messagerie, s'appaire avec un code au premier message et répond sur place ([docs/channels.md](../channels.md)). Un service connecté sur un appareil apparaît sur les autres comme « connecté sur votre Mac — connectez-vous ici pour l'utiliser ici » ; les identifiants restent sur l'appareil qui s'est connecté. |
| **Il continue** | Les objectifs se définissent dans la discussion et sont vérifiés selon un calendrier dans leur propre conversation ; les routines tournent quand l'application est fermée ; l'écran reste allumé pendant qu'il pilote le téléphone ; à 200 étapes, il demande « continuer ? » au lieu de conclure trop tôt. |
| **Il vous écrit un fil** | Chaque matin, de trois à six billets courts à partir de ce qu'il sait de vous et de ce que vous lui avez demandé de suivre, sous forme de cartes que vous pouvez aimer, discuter dans un fil latéral ou supprimer. Une phrase suffit à l'orienter. |
| **Il se souvient de vous** | Qui il est (`SOUL.md`), ce qu'il sait de vous (`USER.md`), ce dont il se souvient (`GLOBAL.md` et un journal) et quand il se réveille (`HEARTBEAT.md`) sont des fichiers que vous pouvez lire et modifier dans l'application. Rapportez ce qu'un autre assistant savait avec *Importer la mémoire*. |
| **Une apparence à lui** | Décrivez-la en une phrase ; votre modèle d'image la dessine ; vous choisissez celle qui vous plaît. L'application la pose pour chaque état — au travail, en attente, content, désolé — et elle respire, se balance, penche la tête, sursaute et se secoue au rythme de ce que fait l'agent ; avec un modèle vidéo, chaque état est un court clip en boucle. Un petit dragon jaune pâle, images et clips compris, est l'apparence par défaut. |
| **Idées et Bibliothèque** | Des choses à demander ensuite, à partir de vos objectifs et de votre mémoire ; et tout ce qu'il a produit, avec aperçus. |

Tout cela tourne sur le téléphone ; le reste d'OpenMinis — le terminal, le navigateur intégré, la gestion de MCP et des compétences, les groupes de modèles, l'usage des jetons, l'exécuteur d'accessibilité, les dossiers partagés — est conservé et accessible depuis les mêmes menus.

## Versions

Une petite version par étape, chacune une release GitHub avec un APK. Les actualités et le tableau complet des versions sont dans le [README anglais](../../README.md#versions) ; le plan et ses raisons dans [docs/roadmap.md](../roadmap.md) ; les notes de chaque version dans [docs/releases/](../releases) et le [CHANGELOG](../../CHANGELOG.md). Ensuite, dans l'ordre : la version web sur une machine à vous (une VM, un serveur à la maison) ; les lunettes.

## Où nous en sommes

0.1 est une préversion. Nous l'utilisons chaque jour et savons où elle accroche encore ; dites-nous où elle a cassé chez vous et ce que vous voudriez qu'elle fasse. Le côté développeur — votre propre modèle, le shell, MCP, les compétences, le harness, l'API du runtime — est dans les Réglages et la documentation. Les interfaces du runtime, des compétences et des plugins vont encore bouger un temps ; le [CHANGELOG](../../CHANGELOG.md) dit ce qui a changé et la [feuille de route](../roadmap.md) ce qui vient ensuite. Si elle vous est utile, une étoile aide les autres à la trouver.

## Contribuer

**[Ouvrir une issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [demander ou montrer dans Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [mettre une étoile au dépôt](https://github.com/nano-muse/nanoMuse)**. Comment fonctionnent le crédit gratuit, votre propre clé et vos données : [docs/cloud.md](../cloud.md) · [docs/own-key.md](../own-key.md) · [docs/privacy.md](../privacy.md). La configuration de build, les conventions (`com.openminis.app` reste, le nouveau code va dans `io.github.nanomuse.*`, `// nanoMuse:` sur les modifications de l'upstream, `Signed-off-by` sur les commits) et la façon dont les versions sont publiées : [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Remerciements

nanoMuse s'appuie sur le travail d'autres personnes ; [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) en donne les conditions. L'application est construite sur [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 — Linux sous proot, shell, navigateur, MCP, compétences, tâches planifiées, l'exécuteur d'accessibilité ; le bac à sable vient de [proot](https://github.com/proot-me/proot) et d'[Alpine Linux](https://alpinelinux.org/).

## Avertissement

nanoMuse est un projet communautaire indépendant. Il n'est ni affilié à Meta Platforms, Inc. ou à son produit Muse, ni approuvé par eux, ni dérivé d'eux ; Muse est une marque de Meta Platforms, Inc. Le dragon appartient au projet.

## Licence

[GPL-3.0-or-later](../../LICENSE). L'application Android est basée sur OpenMinis 1.13 (GPL-3.0), modifiée depuis le 2026-09-24 ; voir [NOTICE](../../NOTICE) et [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Les versions antérieures de la lignée Python ont été publiées sous MIT (tag `pre-openminis`).
