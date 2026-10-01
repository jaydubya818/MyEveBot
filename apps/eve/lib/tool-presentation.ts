const object=(value:unknown):Record<string,unknown> => value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:{};
export function toolPresentation(name:string,input:unknown,output:unknown,state:string) {
  const data=object(output), receipt=object(data.receipt), request=object(input);
  const status=String(data.status??receipt.status??"");
  const failed=["output-error","output-denied"].includes(state)||["failed","denied","unavailable","result_unknown","unknown","revoked"].includes(status)||object(data.result).isError===true;
  const pending=state==="input-streaming"||state==="input-available";
  let label=name.replaceAll("_"," ");
  const governed=["get_factory_work_order","create_factory_work_order","engineering_factory","local_computer_task","federation_request"].includes(name);
  if(name==="create_factory_work_order"||name==="get_factory_work_order") {
    label=name==="create_factory_work_order"?"Sending work to Software Engineer":"Checking Software Engineer progress";
    if(!pending && status==="awaiting_local_factory")label="Work sent — waiting for Software Engineer";
    if(!pending && status==="received_by_factory")label="Software Engineer received the work";
    if(!pending && status==="not_found")label="The work has not been received";
    if(failed)label="Software Engineer connection needs attention";
  } else if(name==="engineering_factory") {
    label=request.operation==="start"?"Requesting Software Engineer work":request.operation==="reconcile"?"Checking the work and its evidence":"Updating Software Engineer work";
    if(failed)label="Work needs attention";
    // A command/producer completion cannot claim independently verified Result.
  } else if(name==="local_computer_task") {
    const labels:Record<string,string>={status:"Checking your Computer",roots:"Finding shared folders",list_files:"Looking through shared files",find_files:"Finding your files",read_text:"Reading your file",write_text:"Updating your file",shell:"Running your approved command",screenshot:"Viewing your screen",click:"Using your desktop",type:"Typing on your desktop",key:"Using your desktop",scroll:"Scrolling your desktop"};
    label=labels[String(request.operation)]??"Using your Computer";
    if(failed)label="Computer action needs attention";
  } else if(name==="federation_request") {
    label=request.operation==="discover"?"Finding authorized agents":request.operation==="permissions"?"Checking agent permissions":request.operation==="status"?"Checking the agent’s response":"Contacting the authorized agent";
    if(failed)label="Agent connection needs attention";
  }
  return {label,failed,governed};
}
