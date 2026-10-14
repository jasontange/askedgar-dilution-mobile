'use client';
import DetailsDialog from './details-dialog';
export {SummaryStar} from './details-dialog';
import {newsDate,type NewsItem} from '../lib/company-news';

function InlineSummary({text}:{text:string}){
  return <>{text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).map((part,index)=>(part.startsWith('**')&&part.endsWith('**'))||(part.startsWith('__')&&part.endsWith('__'))?<strong key={index}>{part.slice(2,-2)}</strong>:part)}</>;
}
// Render the provider's Markdown as React text, never as HTML.
export function SummaryText({summary}:{summary:string|null}){
  if(!summary)return <p className="summary-unavailable">AskEdgar has not provided a summary for this item.</p>;
  const blocks:{kind:'paragraph'|'heading'|'list';lines:string[]}[]=[];
  for(const line of summary.replaceAll('\r','').split('\n')){
    const value=line.trim();if(!value)continue;
    const bullet=value.match(/^[-*•]\s+(.+)/);
    if(bullet){const previous=blocks.at(-1);if(previous?.kind==='list')previous.lines.push(bullet[1]);else blocks.push({kind:'list',lines:[bullet[1]]});continue;}
    const heading=/^#{1,6}\s+/.test(value)||/^(?:\*\*)?\d+[.)]+\s+/.test(value);
    blocks.push({kind:heading?'heading':'paragraph',lines:[value.replace(/^#{1,6}\s+/,'')]});
  }
  return <>{blocks.map((block,index)=>block.kind==='list'?<ul key={index}>{block.lines.map((line,i)=><li key={i}><InlineSummary text={line}/></li>)}</ul>:block.kind==='heading'?<h3 key={index}><InlineSummary text={block.lines[0]}/></h3>:<p key={index}><InlineSummary text={block.lines[0]}/></p>)}</>;
}

type Props={item:NewsItem;ticker?:string;index:number;total:number;hasMore:boolean;loading:boolean;error:string;onClose:()=>void;onPrevious:()=>void;onNext:()=>void};
export default function NewsSummary({item,ticker,index,total,hasMore,loading,error,onClose,onPrevious,onNext}:Props){
  const timestamp=newsDate(item.date);
  return <DetailsDialog title={item.headline} label="Summary" ticker={ticker} item={item} index={index} total={total} hasMore={hasMore} loading={loading} error={error} onClose={onClose} onPrevious={onPrevious} onNext={onNext} meta={<div className="summary-meta"><span className="news-form">{item.formType}</span><time dateTime={item.date||undefined}>{timestamp.date}{timestamp.time&&' · '+timestamp.time}</time></div>}>
    {item.tags.length>0&&<div className="news-tags summary-tags">{item.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
    <div className="summary-prose"><SummaryText summary={item.summary}/></div>
    {item.url&&<a className="summary-source" href={item.url} target="_blank" rel="noopener noreferrer">View {item.formType==='News'?'article':'filing'} ↗</a>}
  </DetailsDialog>;
}
