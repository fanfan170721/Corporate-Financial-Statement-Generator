'use client';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <div className="page"><div className="empty-state panel"><RefreshCw size={32}/><h1>A pause in the research.</h1><p>We could not load this page. Your saved work remains in your account.</p><button className="button button-dark" onClick={reset}>Try again <RefreshCw size={15}/></button><Link className="text-link" href="/workspace">Return to the workspace</Link></div></div>}
