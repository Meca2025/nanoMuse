// The preload of the two overlay windows (resources/glow.html, resources/capsule.html):
// state in from the shell, the capsule's answers and its height out. Nothing else.
import { contextBridge, ipcRenderer } from "electron";

type Listener = (state: unknown) => void;

function onState(listener: Listener): () => void {
  const handler = (_e: Electron.IpcRendererEvent, state: unknown) => listener(state);
  ipcRenderer.on("nanomuse:overlay:state", handler);
  ipcRenderer.send("nanomuse:overlay:ready");
  return () => ipcRenderer.off("nanomuse:overlay:state", handler);
}

contextBridge.exposeInMainWorld("nanomuseGlow", { onState });
contextBridge.exposeInMainWorld("nanomuseCapsule", {
  onState,
  act: (card: string, action: string) => ipcRenderer.send("nanomuse:overlay:act", { card, action }),
  resize: (height: number) => ipcRenderer.send("nanomuse:overlay:resize", height),
});
