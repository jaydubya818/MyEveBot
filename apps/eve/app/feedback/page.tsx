import { notFound } from 'next/navigation';
import { z } from 'zod';
import { BetaFeedbackPanel } from '@/components/owner/beta-feedback';
export const metadata={title:'Beta feedback — MyEve'};
export default async function Page({searchParams}:{searchParams:Promise<{workId?:string}>}) {
  if(process.env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION')notFound();
  const {workId}=await searchParams;
  return <BetaFeedbackPanel workId={z.string().uuid().safeParse(workId).data??null}/>;
}
