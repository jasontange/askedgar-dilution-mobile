'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';

export function SummaryStar(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.5 6.3-.9L12 3Z"/></svg>}

export function DetailsButton({label,onClick}:{label:string;onClick:()=>void}){
  return <button type="button" className="news-summary-star details-trigger" onClick={onClick} aria-label={label} aria-haspopup="dialog" title={label}><SummaryStar/></button>;
}

type Props={title:string;label?:string;ticker?:string;item:unknown;meta?:ReactNode;children:ReactNode;index:number;total:number;hasMore:boolean;loading:boolean;error:string;onClose:()=>void;onPrevious:()=>void;onNext:()=>void};
export default function DetailsDialog({title,label='Details',ticker,item,meta,children,index,total,hasMore,loading,error,onClose,onPrevious,onNext}:Props){
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element.showModal();
    return()=>{element.close();document.body.style.overflow=overflow;if(focused?.isConnected)focused.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{if(content.current)content.current.scrollTop=0;},[item]);
  return <dialog ref={dialog} className="news-summary-dialog" aria-labelledby={id+'-title'} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}}>
    <div className="summary-shell">
      <div className="summary-toolbar"><span><SummaryStar/> {label}{ticker&&<strong className="summary-ticker" aria-label={'Ticker '+ticker} aria-live="polite">{ticker}</strong>}</span><button type="button" className="summary-close" onClick={onClose} aria-label={'Close '+label.toLowerCase()} autoFocus>×</button></div>
      <div className="summary-scroll" ref={content} tabIndex={0} aria-label={label+' content'}>
        {meta}
        <h2 id={id+'-title'} aria-live="polite">{title}</h2>
        {children}
      </div>
      {error&&<div className="summary-error" role="alert">{error} Use Next to try again.</div>}
      <nav className="summary-navigation" aria-label={'Browse '+label.toLowerCase()}><button type="button" disabled={index<=0||loading} onClick={onPrevious}>← Previous</button><span aria-live="polite">{index+1} of {total}{hasMore?'+':''}</span><button type="button" disabled={loading||(index>=total-1&&!hasMore)} onClick={onNext} title={index>=total-1&&hasMore?'Load older items and show the next record':'Next record'}>{loading?'Loading…':'Next →'}</button></nav>
    </div>
  </dialog>;
}
