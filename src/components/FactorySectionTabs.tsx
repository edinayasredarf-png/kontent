import { one } from "@/lib/db";
import { FactoryTabs } from "./FactoryTabs";
import { OrgTabs } from "./shell/OrgTabs";

export async function FactorySectionTabs({ factory, orgId, brandId, tab, canCreate, action }: {
  factory?: string; orgId: string; brandId?: string; tab: "brand" | "knowledge" | "team"; canCreate: boolean; action?: React.ReactNode;
}) {
  const scoped = canCreate && typeof factory === "string" && /^[0-9a-f-]{36}$/i.test(factory)
    ? await one<{ id: string; brand_id: string }>("select id,brand_id from kz_factories where id=$1 and org_id=$2 and ($3::uuid is null or brand_id=$3)", [factory, orgId, brandId ?? null])
    : null;
  if (!scoped) return <OrgTabs action={action} />;
  return <>
    <FactoryTabs factoryId={scoped.id} brandId={scoped.brand_id} tab={tab} canCreate={canCreate} />
    {action && <div className="mb-4 flex justify-end">{action}</div>}
  </>;
}
