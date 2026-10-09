import { OwnerCandidateDecision } from "../../../../components/owner/candidate-decision";
export default async function Page({params}:{params:Promise<{id:string}>}){return <OwnerCandidateDecision workId={(await params).id}/>;}
