import { useParams } from 'react-router-dom';
import { ja } from './ja';
import { en } from './en';
export type Locale = 'ja' | 'en';
export function useLocale() {
  const { locale } = useParams();
  const language: Locale = locale === 'en' ? 'en' : 'ja';
  return { locale: language, t: language === 'ja' ? ja : en };
}
