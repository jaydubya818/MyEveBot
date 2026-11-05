import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {LocalFactoryResults} from './local-factory-results';
// Unit rendering uses the same routing boundary as the existing navigation tests; real navigation is covered in Playwright.
vi.mock('next/link',()=>({default:({href,children}: {href:string;children:React.ReactNode})=>React.createElement('a',{href},children)}));
const result={id:'receipt-a',workId:'work-a',title:'Stage 3/3',receivedAt:'2026-11-05T12:00:00Z',status:'COMPLETED',manifestDigest:'a'.repeat(64),runId:'run-a',workOrderId:'order-a',candidateCommit:'b'.repeat(40),candidateTree:'c'.repeat(40),checksOutcome:'PASS',checksPassed:2,checksTotal:2,historical:true,independentVerification:'NOT_RUN' as const,readiness:'NOT_READY' as const};
it('shows the retained signed Factory evidence without native Proof or publication controls',()=>{
 const html=renderToStaticMarkup(React.createElement(LocalFactoryResults,{results:[result]}));
 expect(html).toContain('Signed local Factory Result');expect(html).toContain('2/2 passed');expect(html).toContain('Independent verification is not established');
 expect(html).toContain(result.manifestDigest);expect(html).toContain(result.candidateCommit);expect(html).toContain('Retained history');expect(html).toContain('/work/work-a');
 for(const forbidden of ['Publish candidate','Accept result','Verified candidate','Independent verification: PASS'])expect(html).not.toContain(forbidden);
});
it('filters selected Work/receipt and renders no unrelated result',()=>{
 expect(renderToStaticMarkup(React.createElement(LocalFactoryResults,{results:[result],selectedId:'foreign'}))).toBe('');
 expect(renderToStaticMarkup(React.createElement(LocalFactoryResults,{results:[result],selectedId:'receipt-a'}))).toContain('Stage 3/3');
});
