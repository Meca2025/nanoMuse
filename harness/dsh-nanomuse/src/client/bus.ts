/**
 * The one piece of shared state between our seats: how to open Settings. The
 * settings shell (ours, when it occupies `sidebar.settings`) sets `open` while
 * it is mounted; the rail's menu, the header's face and the pages call it.
 */
export const settingsBus: { open?: (() => boolean) | undefined; openSection?: ((id: string) => boolean) | undefined } = {}
