import {
  Download, Upload, Clock, Check, FolderOpen, FileText, Image, Camera, ImagePlus, Lock, LayoutDashboard, UserPlus, Users,
  Building2, Pill, FlaskConical, List, Search, Ticket, Stethoscope, History, Plus, Package, Truck, Receipt, Menu, LogOut,
  Globe, Printer, Pencil, Eye, Trash2, KeyRound, ChevronLeft, ChevronRight, ChevronDown, X, MessageCircle, Store,
  ShoppingCart, PackagePlus, Undo2, BarChart3, ClipboardList, UserCheck, Wallet, Layers, ShieldCheck, Settings,
} from 'lucide-react';
import vitalsIconUrl from '../assets/vitals-icon.png';
import cancelIconUrl from '../assets/cancel-icon.png';
import doctorIconUrl from '../assets/doctor-icon.png';
import confirmIconUrl from '../assets/confirm-icon.png';
import patientCardIconUrl from '../assets/patient-card-icon.png';
import uploadIconUrl from '../assets/upload-icon.png';

// The old icon names (used by menu.js and a few screens) mapped to lucide-react icons.
// New code imports lucide icons directly: import { Save } from 'lucide-react'.
export const ICONS = {
  download: Download, upload: Upload, clock: Clock, check: Check, folder: FolderOpen, file: FileText, image: Image,
  camera: Camera, imagePlus: ImagePlus, lock: Lock, dashboard: LayoutDashboard, userPlus: UserPlus, users: Users,
  building: Building2, pill: Pill, flask: FlaskConical, list: List, search: Search, ticket: Ticket, stethoscope: Stethoscope,
  history: History, plus: Plus, box: Package, truck: Truck, receipt: Receipt, menu: Menu, logout: LogOut, globe: Globe,
  print: Printer, edit: Pencil, eye: Eye, trash: Trash2, key: KeyRound, chevronLeft: ChevronLeft, chevronRight: ChevronRight,
  chevronDown: ChevronDown, x: X, message: MessageCircle, store: Store, cart: ShoppingCart, packagePlus: PackagePlus,
  undo: Undo2, chart: BarChart3, clipboard: ClipboardList, userCheck: UserCheck, wallet: Wallet, layers: Layers,
  shield: ShieldCheck, settings: Settings,
};

export default function Icon({ name, size = 16, className = '' }) {
  const C = ICONS[name] || List;
  return <C size={size} className={`shrink-0 ${className}`} aria-hidden />;
}

// Picture icons (PNG) used on a few row buttons.
const pic = (url) => function PictureIcon({ size = 28, className = '' }) {
  return <img className={`block rounded-md object-contain ${className}`} src={url} width={size} height={size} alt="" aria-hidden />;
};
/** Heart-in-hand picture (Add vital signs) */
export const VitalsIcon = pic(vitalsIconUrl);
/** Red "no entry" picture (Cancel token) */
export const CancelIcon = pic(cancelIconUrl);
/** Doctor with stethoscope (Send to doctor) */
export const DoctorIcon = pic(doctorIconUrl);
/** Green round tick (Confirm token) */
export const ConfirmIcon = pic(confirmIconUrl);
/** Document with a cross (Patient card) */
export const PatientCardIcon = ({ size = 22, ...p }) => pic(patientCardIconUrl)({ size, ...p });
/** Blue upload picture (Upload lab reports & scans) */
export const UploadIcon = ({ size = 30, ...p }) => pic(uploadIconUrl)({ size, ...p });
