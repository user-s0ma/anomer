import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageBody } from "@/components/PageBody";
import { createShop } from "@/lib/api-client";
import { useMe } from "./_layout";

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.data?.shop) navigate("/app");
  }, [me.data, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createShop({ name: name.trim(), cityId });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/app");
    } catch {
      toast.error(t("common.error"));
      setBusy(false);
    }
  };

  return (
    <PageBody title={t("setup.title")}>
      <div className="max-w-xl pl-2">
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs">{t("setup.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs">{t("setup.city")}</span>
            <select value={cityId} onChange={(e) => setCityId(e.target.value)} required className="input">
              <option value="" disabled>
                {t("setup.cityPlaceholder")}
              </option>
              {me.data?.cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end">
            <button type="submit" className="button-primary" disabled={busy || !cityId || !name.trim()}>
              {busy ? t("setup.creating") : t("setup.submit")}
            </button>
          </div>
        </form>
      </div>
    </PageBody>
  );
}
