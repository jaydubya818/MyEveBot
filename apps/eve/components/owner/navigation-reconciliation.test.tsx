import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/today"}));
vi.mock("next/link",()=>({default:({href,children,...props}:any)=>createElement("a",{href,...props},children)}));
vi.mock("@/components/command-palette",()=>({CommandPalette:()=>null}));
import {DestinationGate} from "./destination-gate";
import {OwnerNavigation} from "./navigation";
import {productDestinations} from "./destinations";
import {TeamHub} from "./product-hubs";
import {allowedDestinationHrefs} from "@/lib/external-alpha/features";
const render=(hrefs:readonly string[]|null)=>renderToStaticMarkup(<DestinationGate hrefs={hrefs}><OwnerNavigation/></DestinationGate>);

describe("existing QA100 navigation reconciliation",()=>{
  it("makes the server-allowed Results and Activity reachable while Memory stays denied",()=>{
    const html=render(allowedDestinationHrefs(productDestinations,{NODE_ENV:"test",EVE_PROJECT_NAME:"myeve-alpha-tester-1"}));
    expect(html).toContain('href="/results"');
    expect(html).toContain('href="/activity"');expect(html).not.toContain('href="/memory"');
  });
  it("respects a narrower destination gate for every account link",()=>{
    const html=render(["/today","/settings"]);
    for(const href of["/results","/memory","/activity"])expect(html).not.toContain(`href="${href}"`);
  });
  it("explains Deep Agent only inside a locked external-alpha installation",()=>{
    expect(render(["/today","/results"])).toContain("Deep Agent is unavailable until qualified");
    expect(render(null)).not.toContain("Deep Agent is unavailable until qualified");
  });
  it("keeps unrestricted account destinations distinct and available",()=>{
    const html=render(null);
    for(const href of["/results","/memory","/activity"])expect(html).toContain(`href="${href}"`);
  });
  it("uses the Team page label and keeps Activity distinct from Memory",()=>{
    expect(productDestinations.find(item=>item.href==="/team")?.label).toBe("Team");
    expect(productDestinations.find(item=>item.href==="/activity")?.label).toBe("Activity");
    expect(renderToStaticMarkup(<TeamHub/>)).toMatch(/<h1[^>]*>Team<\/h1>/);
  });
});
