<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/app-icon.png" width="128" alt="Icono de la app nanoMuse">
</p>

<h1 align="center">nanoMuse</h1>

<p align="center">Un agente personal al estilo de Muse, completamente de código abierto, para todos tus dispositivos.</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README.md">English</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_zh.md">简体中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_zh-TW.md">繁體中文</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_es.md">Español</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_fr.md">Français</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_id.md">Bahasa Indonesia</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ja.md">日本語</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ko.md">한국어</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_ru.md">Русский</a> |
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/README_vi.md">Tiếng Việt</a>
</p>

<p align="center">
  <a href="https://github.com/nano-muse/nanoMuse/stargazers"><img src="https://img.shields.io/github/stars/nano-muse/nanoMuse?style=flat&label=stars" alt="Estrellas en GitHub"></a>
  <a href="https://github.com/nano-muse/nanoMuse/releases"><img src="https://img.shields.io/github/downloads/nano-muse/nanoMuse/total?label=downloads" alt="Descargas"></a>
  <a href="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml"><img src="https://github.com/nano-muse/nanoMuse/actions/workflows/ci.yml/badge.svg?branch=main" alt="Test Suite"></a>
  <a href="https://nanomuse.cn/web/"><img src="https://img.shields.io/badge/Pru%C3%A9balo%20en%20el%20navegador-nanomuse.cn%2Fweb-5B4EE6" alt="Pruébalo en el navegador"></a>
  <a href="https://nanomuse.cn/"><img src="https://img.shields.io/badge/Sitio%20web-nanomuse.cn-0a66e4" alt="Sitio web"></a>
  <a href="https://github.com/nano-muse/nanoMuse/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nano-muse/nanoMuse?label=license" alt="GPL-3.0-or-later"></a>
</p>

> [!IMPORTANT]
> **Gratuito, de código abierto, sin ánimo de lucro: un agente personal para todos.** nanoMuse es un proyecto comunitario, gratuito para siempre: inicia sesión con un número de teléfono o un correo electrónico y el modelo viene con una asignación gratuita que paga el desarrollador; cuando se agota, trae tu propia clave. Los mensajes no se guardan salvo que decidas contribuirlos; nada se vende; borra la cuenta cuando quieras. **[Pruébalo en el navegador](https://nanomuse.cn/web/)** o [descarga la app](https://github.com/nano-muse/nanoMuse/releases/latest).

> Esta página es una traducción del [README en inglés](README.md), que es la referencia y contiene las novedades y la tabla completa de versiones.

nanoMuse es un agente personal al estilo de Muse, completamente de código abierto, para todos tus dispositivos: un solo agente con nombre y aspecto propios, como el [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) de Meta, que hace cosas en vez de responder preguntas, sigue trabajando con la app cerrada, te recuerda y se detiene a preguntar antes de cualquier cosa que no podrías deshacer. La app de Android ejecuta el agente entero **en el teléfono**: un sistema de archivos Linux, una shell, un navegador, MCP, habilidades y tareas programadas dentro del APK, con un modelo que tú aportas. Tiene manos para las apps que nunca tuvieron API —la propia pantalla del teléfono, con tu permiso— y llega hasta tu ordenador: dilo en el teléfono y se hace allí. La app de escritorio y la versión web también están disponibles; iOS y las gafas vienen después. Tu propia clave o una asignación inicial de un relé abierto, GPL-3.0 — y una base sobre la que construir tu propio Muse.

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/avatar-moods.png" width="88%" alt="El mismo dragoncito en cinco estados: en reposo, trabajando, esperando, contento, apenado">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/chat-approval.png" width="23%" alt="Chat: antes de borrar en el espacio de trabajo, el agente se detiene y pregunta — una vez, este chat, siempre para el espacio de trabajo, o denegar">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/feed.png" width="23%" alt="Feed: publicaciones escritas para ti esta mañana">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/goals.png" width="23%" alt="Metas: seguidas según un horario, con rutinas">
  <img src="https://raw.githubusercontent.com/nano-muse/nanoMuse/main/docs/screenshots/avatar.png" width="23%" alt="Avatar: describe un aspecto, tu modelo de imagen lo dibuja, eliges el que te gusta">
</p>

## Por qué nanoMuse

Cuatro cosas definen el proyecto.

| | |
|---|---|
| **Al estilo de Muse** | Un agente, no una caja de herramientas: nombre y aspecto propios, una primera conversación, un feed escrito para ti, metas en las que trabaja en segundo plano, una memoria que puedes leer y editar, y una aprobación antes de cualquier cosa que no podrías deshacer. |
| **Completamente abierto** | GPL-3.0-or-later, el repositorio entero. Sin componentes cerrados, sin cuenta ni servidor obligatorios, sin modelo obligatorio — el relé opcional nanoMuse Cloud también está en el repositorio y cualquiera puede ejecutar uno; cada versión se compila desde su etiqueta y se instala a mano. Muse, 豆包 y 千问 son productos que te dan; nanoMuse es uno que posees — y una base para construir tu propio Muse: cámbiale el nombre, redibújalo, reescribe su personalidad, conecta tus propios modelos y herramientas. |
| **Cualquier app, con API o sin ella** | Buena parte del día pasa por apps que nunca tuvieron API. El agente sube una escalera: primero una habilidad, una CLI o un servidor MCP; luego una página obtenida con tu sesión; luego el navegador integrado; y, cuando lo permites, la propia pantalla del dispositivo, mirando y tocando como lo harías tú — con las mismas aprobaciones antes de pagar, enviar o borrar. Desactivado por defecto. |
| **Todos los dispositivos** | Un agente, y cada dispositivo tuyo es un par de manos y una puerta de entrada: dilo en el teléfono y ocurre en tu PC; díselo a tus gafas y ocurre en ambos. El teléfono ya maneja tu ordenador; la app de escritorio y la web ya están aquí; iOS y las gafas vienen después. |

Cómo se compara con Muse y con OpenMinis, el runtime sobre el que está construida la app: en el [README en inglés](README.md#compared-with-muse-and-openminis). El plan y sus razones: [docs/roadmap.md](docs/roadmap.md).

## Instalación

Nada que instalar: inicia sesión en [nanomuse.cn/web](https://nanomuse.cn/web/) con un número de teléfono o un correo y un código, y tendrás un nanoMuse propio en el servidor del proyecto, conservado entre visitas — ideal para una primera prueba; para el día a día, la app del teléfono y la de escritorio de abajo, con la misma cuenta. Para tus propios dispositivos, las [descargas](https://nanomuse.cn/#download): el APK de Android, la app de escritorio para Windows, macOS y Linux (`nanoMuse-Desktop-<version>-…`), el binario de terminal (`nanomuse-desktop-terminal-<version>-…`), o `pipx install "git+https://github.com/nano-muse/nanoMuse"` con Python 3.11+. Si las descargas de GitHub fallan donde estás, los mismos archivos están en el espejo del proyecto, [nanomuse.cn/dl](https://nanomuse.cn/dl/) (sincronizado en los quince minutos siguientes a cada versión, con comprobación SHA-256); [docs/desktop.md](docs/desktop.md) y [docs/every-device.md](docs/every-device.md) explican cómo se encuentran entre sí. En el teléfono:

1. Descarga `nanoMuse-<version>-arm64.apk` de la [última versión](https://github.com/nano-muse/nanoMuse/releases/latest) — Android 8.0 o posterior, un teléfono de 64 bits. Verifica con `sha256sum -c nanoMuse-<version>-arm64.apk.sha256` si quieres.
2. Ábrelo. Android pide permiso una vez para instalar; todas las versiones se firman con la misma clave, así que las actualizaciones se instalan sobre la anterior y conservan tus datos.
3. Conecta un modelo. *Iniciar sesión — gratis*: un número de teléfono (el código llega por SMS) o un correo electrónico, y el agente tiene una asignación gratuita en [nanoMuse Cloud](docs/cloud.md) — sin clave, sin pagar nada; la página de la cuenta dice cuánto queda y cómo crece. Cuando se agote, trae la tuya: [Alibaba Cloud Bailian](docs/own-key.md) en unos dos minutos, cualquier endpoint compatible con OpenAI con tu clave, o uno de los inicios de sesión OAuth que trae la app. Después, si quieres, los dos permisos que dejan al agente usar las apps de tu teléfono (se pueden omitir), y la primera conversación, que pregunta cómo llamarte y deja que el agente elija su propio nombre.
4. Opcional — *Ajustes → Modelos de imagen y vídeo*: un modelo de imagen (qwen-image-3.0 en Alibaba Cloud Model Studio, gpt-image-1, o cualquier proveedor con el endpoint de imágenes de OpenAI) permite al agente cambiar su aspecto y dibujar; un modelo de vídeo (wan2.2-i2v-flash en Model Studio) hace que el aspecto se mueva. Muse los trae integrados; nanoMuse usa los tuyos, y el agente te avisa cuando falta uno.

La app busca actualizaciones en las versiones de este repositorio. Las notas de cada versión están en [docs/releases/](docs/releases/) y en el [CHANGELOG](CHANGELOG.md).

## Qué hace

| | |
|---|---|
| **Hace cosas** | Una shell de Linux, un navegador, servidores MCP, habilidades en el formato [Agent Skills](https://agentskills.io) y — al activar *Manos* — las apps de tu teléfono a través de su pantalla: una captura, una acción, otra captura, con una escalera que prueba primero las API, una toma de control para los inicios de sesión y las mismas aprobaciones. El agente elige la mano que necesita el trabajo y muestra cada paso como una tarjeta que puedes abrir. |
| **Pregunta primero** | Una parada antes de borrar, enviar o pagar — en la shell y en el navegador — con una aprobación que acotas a una vez, a este chat o a siempre para este destinatario, dominio o carpeta, y que puedes revocar en Permisos. Las contraseñas y los códigos de verificación siempre los escribes tú. |
| **Sigue adelante** | Las metas se definen en el chat y se revisan según un horario en su propia conversación; las rutinas se ejecutan con la app cerrada; la pantalla se mantiene encendida mientras maneja el teléfono; a los 200 pasos pregunta «¿continuar?» en lugar de terminar antes de tiempo. |
| **Te escribe un feed** | Cada mañana, de tres a seis publicaciones cortas a partir de lo que sabe de ti y de lo que le pediste seguir, como tarjetas que puedes marcar con un «me gusta», comentar en un chat lateral o borrar. Una frase basta para orientarlo. |
| **Te recuerda** | Quién es (`SOUL.md`), qué sabe de ti (`USER.md`), qué recuerda (`GLOBAL.md` y un diario) y cuándo despierta (`HEARTBEAT.md`) son archivos que puedes leer y editar en la app. Trae lo que sabía otro asistente con *Importar memoria*. |
| **Un aspecto propio** | Descríbelo en una frase; tu modelo de imagen lo dibuja; eliges el que te gusta. La app lo posa para cada estado — trabajando, esperando, contento, apenado — y respira, se balancea, ladea la cabeza, salta y se sacude según lo que hace el agente; con un modelo de vídeo, cada estado es un clip corto en bucle. Un dragoncito amarillo pálido, con imágenes y clips incluidos, es el predeterminado. |
| **Ideas y Biblioteca** | Cosas que preguntar a continuación, a partir de tus metas y tu memoria; y todo lo que ha creado, con vistas previas. |

Todo se ejecuta en el teléfono; el resto de OpenMinis — el terminal, el navegador integrado, la gestión de MCP y habilidades, los grupos de modelos, el uso de tokens, el ejecutor de accesibilidad, las carpetas compartidas — se conserva y es accesible desde los mismos menús.

## Versiones

Una versión pequeña por etapa, cada una una release de GitHub con un APK. Las novedades y la tabla completa de versiones están en el [README en inglés](README.md#versions); el plan y sus razones en [docs/roadmap.md](docs/roadmap.md); las notas de cada versión en [docs/releases/](docs/releases/) y el [CHANGELOG](CHANGELOG.md). Después, en orden: iOS; la versión web en una máquina propia (una VM, un servidor doméstico); las gafas.

## Contribuir

Informa de un error, pide una función, envía un pull request — cada uno acerca un agente personal al alcance de todos: **[abre un issue](https://github.com/nano-muse/nanoMuse/issues/new/choose) · [pregunta o muestra en Discussions](https://github.com/nano-muse/nanoMuse/discussions) · [dale una estrella al repositorio](https://github.com/nano-muse/nanoMuse)**. Cómo funcionan la asignación gratuita, tu propia clave y tus datos: [docs/cloud.md](docs/cloud.md) · [docs/own-key.md](docs/own-key.md) · [docs/privacy.md](docs/privacy.md). La configuración de compilación, las convenciones (`com.openminis.app` se mantiene, el código nuevo va en `io.github.nanomuse.*`, `// nanoMuse:` en las ediciones del upstream, `Signed-off-by` en los commits) y cómo se publican las versiones: [CONTRIBUTING.md](CONTRIBUTING.md).

## Agradecimientos

nanoMuse se apoya en el trabajo de otros; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) recoge las licencias. La app está construida sobre [OpenMinis](https://github.com/OpenMinis/OpenMinis) 1.13 — Linux con proot, shell, navegador, MCP, habilidades, tareas programadas, el ejecutor de accesibilidad; el sandbox viene de [proot](https://github.com/proot-me/proot) y [Alpine Linux](https://alpinelinux.org/).

## Aviso

nanoMuse es un proyecto comunitario independiente. No está afiliado a Meta Platforms, Inc. ni a su producto Muse, ni respaldado por ellos, ni derivado de ellos; Muse es una marca de Meta Platforms, Inc. El dragón es propio del proyecto.

## Licencia

[GPL-3.0-or-later](LICENSE). La app de Android se basa en OpenMinis 1.13 (GPL-3.0), modificada desde el 2026-09-24; consulta [NOTICE](NOTICE) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Las versiones anteriores de la línea Python se publicaron bajo MIT (etiqueta `pre-openminis`).
