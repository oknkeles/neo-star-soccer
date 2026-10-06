/**
 * Name → icon registry for DATA-DRIVEN icons (activities, shop items, events, traits …).
 * Game data stores one of these keys as a string; UI renders <Icon name=... />.
 * Components that need a fixed icon may import from 'lucide-react' directly.
 */
import {
  Activity, Award, Baby, BadgeCheck, BadgeDollarSign, Banknote, Bed, Bell, Bike, Book, BookOpen, Brain, Briefcase,
  Building2, Cake, Calendar, Camera, Car, CarFront, Castle, ChartLine, Church, CircleDollarSign, Clapperboard,
  Coffee, Crown, Diamond, Dog, Dumbbell, Flame, Footprints, Gamepad2, Gem, Gift, Glasses, Globe, GraduationCap,
  HandCoins, HandHeart, HeartHandshake, Heart, HeartPulse, House, Hospital, Laptop, Megaphone, MessageCircle, Mic, Moon,
  Music, Newspaper, Palette, PartyPopper, PawPrint, Phone, Plane, Radio, Sailboat, Scale, Shield, ShieldAlert,
  Shirt, ShoppingBag, Siren, Smartphone, Smile, Sparkles, Star, Stethoscope, Sun, Swords, Target, Tent, Ticket,
  Timer, TrendingDown, TrendingUp, Trophy, Tv, Umbrella, UserRound, Users, Utensils, Wallet, Watch, Wine, Zap,
  Frown, Handshake, Crosshair, Wind, Snowflake, CloudRain, Medal, Rocket, Skull, Eye, Lock, Mail, Flag,
  type LucideIcon,
  ArrowRight, Bot, Check, ChevronRight, Cloud, CloudFog, CloudSun, Dices, Download, Inbox, Info, KeyRound, Languages, Minus, MoveRight, PenLine, Play, Quote, Save, Search, Settings, Trash2, Upload, X,
  } from 'lucide-react';

export const ICONS = {
  activity: Activity, award: Award, baby: Baby, verified: BadgeCheck, dollar_badge: BadgeDollarSign, banknote: Banknote,
  bed: Bed, bell: Bell, bike: Bike, book: Book, book_open: BookOpen, brain: Brain, briefcase: Briefcase,
  building: Building2, cake: Cake, calendar: Calendar, camera: Camera, car: Car, car_front: CarFront, castle: Castle,
  chart: ChartLine, church: Church, coin: CircleDollarSign, film: Clapperboard, coffee: Coffee, crown: Crown,
  diamond: Diamond, dog: Dog, dumbbell: Dumbbell, flame: Flame, footprints: Footprints, gamepad: Gamepad2, gem: Gem,
  gift: Gift, glasses: Glasses, globe: Globe, graduation: GraduationCap, hand_coins: HandCoins, hand_heart: HandHeart,
  handshake_heart: HeartHandshake, heart: Heart, heart_pulse: HeartPulse, house: House, hospital: Hospital,
  laptop: Laptop, megaphone: Megaphone, message: MessageCircle, mic: Mic, moon: Moon, music: Music,
  newspaper: Newspaper, palette: Palette, party: PartyPopper, paw: PawPrint, phone: Phone, plane: Plane,
  radio: Radio, boat: Sailboat, scale: Scale, shield: Shield, shield_alert: ShieldAlert, shirt: Shirt,
  shopping: ShoppingBag, siren: Siren, smartphone: Smartphone, smile: Smile, sparkles: Sparkles, star: Star,
  stethoscope: Stethoscope, sun: Sun, swords: Swords, target: Target, tent: Tent, ticket: Ticket, timer: Timer,
  trend_down: TrendingDown, trend_up: TrendingUp, trophy: Trophy, tv: Tv, umbrella: Umbrella, user: UserRound,
  users: Users, utensils: Utensils, wallet: Wallet, watch: Watch, wine: Wine, zap: Zap, frown: Frown,
  handshake: Handshake, crosshair: Crosshair, wind: Wind, snow: Snowflake, rain: CloudRain, medal: Medal,
  rocket: Rocket, skull: Skull, eye: Eye, lock: Lock, mail: Mail, flag: Flag,
  check: Check, trash: Trash2, save: Save, dice: Dices, x: X, play: Play, download: Download, upload: Upload, settings: Settings, inbox: Inbox, languages: Languages, key: KeyRound, cloud: Cloud, cloud_sun: CloudSun, fog: CloudFog, quote: Quote, search: Search, arrow_right: ArrowRight, chevron_right: ChevronRight, minus: Minus, trend_flat: MoveRight, info: Info, bot: Bot, home: House, pen: PenLine,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function iconFor(name: string): LucideIcon {
  return (ICONS as Record<string, LucideIcon>)[name] ?? Sparkles;
}
