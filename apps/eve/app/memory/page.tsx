import { IntegratedExperience } from "@/components/owner/integrated";
export default async function Page({searchParams}:{searchParams:Promise<{workId?:string}>}) { const query=await searchParams; return <IntegratedExperience view="memory" selectedId={query.workId}/>; }
