import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { PageBody } from "@/components/PageBody";
import { InvestigationDetail } from "@/components/result/InvestigationDetail";
import { useInvestigations } from "./_layout";

export default function InvestigationPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const list = useInvestigations();
  const item = list.data?.items.find((i) => i.id === id);

  return (
    <PageBody>
      <div className="pt-12">
        {list.isPending ? (
          <p className="text-sm text-black/50">{t("common.loading")}</p>
        ) : item ? (
          <InvestigationDetail investigation={item} />
        ) : (
          <p className="text-sm text-black/50">{t("notFound")}</p>
        )}
      </div>
    </PageBody>
  );
}
