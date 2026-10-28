'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Play, ArrowUpRight } from 'lucide-react';
import { useI18n } from './i18n';
import './first-visit-intro.css';

const INTRO_COOKIE = 'finscope-intro-seen';
const INTRO_DURATION = 4600;

/** A browser-local welcome, independent of account access and report loading. */
export default function FirstVisitIntro({ firstVisit }: { firstVisit: boolean }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const automaticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useRef(false);
  const closing = useRef(false);
  const [booting, setBooting] = useState(firstVisit);
  const [playing, setPlaying] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const finish = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (automaticTimer.current) clearTimeout(automaticTimer.current);
    setLeaving(true);
    exitTimer.current = setTimeout(() => {
      dialog.current?.close();
      setPlaying(false);
    }, reducedMotion.current ? 0 : 560);
  }, []);

  useLayoutEffect(() => {
    setBooting(false);
    // Check again on the client so a stale page or history entry cannot replay it.
    const seen = document.cookie.split(';').some(cookie => cookie.trim() === `${INTRO_COOKIE}=1`);
    if (firstVisit && !seen) setPlaying(true);
  }, [firstVisit]);

  useLayoutEffect(() => {
    if (!playing || !dialog.current) return;
    const element = dialog.current;
    closing.current = false;
    setLeaving(false);
    reducedMotion.current = matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.reducedMotion === 'true';
    document.cookie = `${INTRO_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    automaticTimer.current = setTimeout(finish, INTRO_DURATION);
    return () => {
      if (automaticTimer.current) clearTimeout(automaticTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [playing, finish]);

  return <>
    {booting && <div className="finscope-intro-boot" aria-hidden="true"><span className="finscope-intro-boot__mark">Finscope<span>.</span></span></div>}
    <dialog ref={dialog} className={`finscope-intro${leaving ? ' is-leaving' : ''}`} aria-labelledby="finscope-intro-title" aria-describedby="finscope-intro-description" onCancel={event => { event.preventDefault(); finish(); }}>
      <div className="finscope-intro__wash finscope-intro__wash--blue" aria-hidden="true"/>
      <div className="finscope-intro__wash finscope-intro__wash--pink" aria-hidden="true"/>
      <div className="finscope-intro__frame" aria-hidden="true"/>
      <div className="finscope-intro__topline"><span>Finscope<span className="finscope-intro__dot">.</span></span><span>{t('A clearer perspective.')}</span></div>
      <div className="finscope-intro__content">
        <p className="finscope-intro__eyebrow">{t('Created by')}</p>
        <h1 id="finscope-intro-title"><span>Zidong</span> <span>Yuan<span className="finscope-intro__name-dot">.</span></span></h1>
        <div className="finscope-intro__line" aria-hidden="true"><span/><i/><span/></div>
        <p id="finscope-intro-description" className="finscope-intro__description">{t('Company insight, grounded in public information.')}</p>
        <div className="finscope-intro__sources">
          <span className="finscope-intro__source-label">{t('Built on public evidence')}</span>
          <p><span>SEC EDGAR</span><i aria-hidden="true"/><span>{t('Company annual reports')}</span><i aria-hidden="true"/><span>{t('Public disclosures')}</span></p>
        </div>
      </div>
      <div className="finscope-intro__bottomline"><span>{t('Follow the evidence. See the bigger picture.')}</span><button type="button" autoFocus onClick={finish}>{t('Skip intro')} <ArrowRight size={17}/></button></div>
      <div className="finscope-intro__progress" aria-hidden="true"><span/></div>
    </dialog>
    <div className="entry-about">
      <button type="button" onClick={() => setPlaying(true)}><Play size={11}/>{t('About Finscope')}</button>
      <span aria-hidden="true"/>
      <a href="/methodology">{t('Data & methodology')} <ArrowUpRight size={12}/></a>
    </div>
  </>;
}
