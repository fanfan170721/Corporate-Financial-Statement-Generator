import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
export default function NotFound(){return <div className="page"><div className="empty-state panel"><Compass size={38}/><span className="eyebrow">A DIFFERENT DIRECTION</span><h1>This page is outside our coverage.</h1><p>The report may have moved, or the address may be incomplete. Your next research question is still a good place to start.</p><Link className="button button-dark" href="/workspace">Back to research <ArrowRight size={16}/></Link></div></div>}
