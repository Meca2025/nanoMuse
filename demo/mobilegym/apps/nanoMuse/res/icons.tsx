// Icons used by the nanoMuse shell. Monochrome lucide icons, colored with currentColor — except
// the launcher icon, which is the nanoMuse mark in its own colours (res/mark.tsx, the same N the
// Android app's launcher icon has).
import { AlertTriangle, ChevronLeft, Hand, KeyRound, Link2, Monitor, MessageCircle, RefreshCw, Unplug } from 'lucide-react';
import { NanoMuseMark } from './mark';

export const IcLauncher = NanoMuseMark;
export const IcBack = ChevronLeft;
export const IcLink = Link2;
export const IcRetry = RefreshCw;
export const IcOffline = Unplug;
export const IcWarning = AlertTriangle;
// the welcome page's rows, as on the Android app's first page
export const IcChat = MessageCircle;
export const IcHands = Hand;
export const IcReach = Monitor;
export const IcKey = KeyRound;

/** The dragon's face at rest — the Muse's default look, as the Android app shows it on its first page. */
export { default as dragonIdle } from './dragon-idle.webp';
