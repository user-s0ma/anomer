import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CloudSun, Plug, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageBody } from "@/components/PageBody";
import { formatDate, formatValue } from "@/components/result/format";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { connectSource, disconnectSource, getData, getSources, type Connection, type DataResponse } from "@/lib/api-client";
import type { SourceDefinition } from "@/lib/sources/types";
import { useMe } from "./_layout";

/** 詳しい画面のグラフに出す日数 */
const DAYS = 90;

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (points.length < 2) return null;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const d = points
    .map(([i, v], k) => `${k === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - lo) / (hi - lo || 1)) * 26).toFixed(2)}`)
    .join("");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" className="stroke-accent" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 店がつないだデータ源 (プラグイン) の一覧。追加、外す、行を押すと設定と数字 */
export default function Sources() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const me = useMe();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const data = useQuery({ queryKey: ["data"], queryFn: getData });
  const demo = me.data?.user.demo ?? true;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
    void queryClient.invalidateQueries({ queryKey: ["data"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const remove = useMutation({
    mutationFn: disconnectSource,
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const available = sources.data?.available ?? [];
  const connected = sources.data?.connected ?? [];
  const definitionOf = (id: string) => available.find((s) => s.id === id)!;
  const lastDate = data.data?.dates[data.data.dates.length - 1];
  const open = openId ? connected.find((c) => c.sourceId === openId) : undefined;

  return (
    <PageBody
      title={t("sources.title")}
      action={
        !demo && (
          <button type="button" className="button-primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t("sources.add")}</span>
          </button>
        )
      }
    >
      {sources.isPending ? (
        <p className="pl-2 text-sm text-black/50">{t("common.loading")}</p>
      ) : sources.isError ? (
        <p className="pl-2 text-sm text-down">{t("common.error")}</p>
      ) : (
        <div>
          {connected.map((connection) => {
            const source = definitionOf(connection.sourceId);
            const Icon = source.kind === "live" ? CloudSun : Plug;
            return (
              <div
                key={connection.sourceId}
                className="group flex items-center gap-3 border-b border-black/20 px-3 py-3 transition-colors hover:rounded-2xl hover:bg-black/10"
              >
                <Icon className="size-4 shrink-0 text-black/50" />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(connection.sourceId)}>
                  <p className="truncate text-sm">{source.label[locale]}</p>
                  <p className="mt-0.5 truncate text-xs text-black/50">
                    {source.kind === "live" ? t("sources.live") : t("sources.simulated")}
                    {" ・ "}
                    {source.modeledOn}
                    {" ・ "}
                    {t("sources.metrics", { count: source.metrics.length })}
                    {lastDate && ` ・ ${t("sources.until", { date: formatDate(lastDate, locale) })}`}
                  </p>
                </button>
                {!demo && (
                  <RowMenu
                    ariaLabel={t("sources.actions")}
                    disabled={remove.isPending}
                    items={[{ label: t("sources.remove"), icon: Trash2, danger: true, onSelect: () => remove.mutate(connection.sourceId) }]}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <SourceDetail
          source={definitionOf(open.sourceId)}
          connection={open}
          data={data.data}
          cities={me.data?.cities ?? []}
          onClose={() => setOpenId(null)}
        />
      )}
      {adding && (
        <AddSource
          options={available.filter((s) => !connected.some((c) => c.sourceId === s.id))}
          connectedIds={connected.map((c) => c.sourceId)}
          cities={me.data?.cities ?? []}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </PageBody>
  );
}

/** 設定の値を、画面に出す文字にする */
function settingText(field: SourceDefinition["settings"][number], value: unknown, cities: { id: string; label: string }[], locale: Locale) {
  if (field.type === "city") return cities.find((c) => c.id === value)?.label ?? String(value);
  if (field.type === "date") return formatDate(String(value), locale);
  return String(value);
}

function SourceDetail({
  source,
  connection,
  data,
  cities,
  onClose,
}: {
  source: SourceDefinition;
  connection: Connection;
  data: DataResponse | undefined;
  cities: { id: string; label: string }[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const metrics = data?.sources.find((s) => s.id === source.id)?.metrics ?? [];
  return (
    <Modal title={source.label[locale]} size="3xl" onClose={onClose}>
      <div className="space-y-5 px-6 pb-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {source.settings.map((field) => (
            <div key={field.key} className="flex justify-between gap-3 border-b border-black/10 py-1.5">
              <dt className="text-black/50">{field.label[locale]}</dt>
              <dd className="num">{settingText(field, connection.config[field.key], cities, locale)}</dd>
            </div>
          ))}
        </dl>
        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {metrics.map((m) => {
            const recent = m.values.slice(-DAYS);
            const last = [...recent].reverse().find((v) => v !== null);
            return (
              <li key={m.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{m.label[locale]}</span>
                  {last !== undefined && last !== null && <span className="num text-sm text-black/50">{formatValue(last, m.unit, locale)}</span>}
                </div>
                <Sparkline values={recent} />
                {m.latencyDays > 0 && <p className="text-xs text-black/50">{t("sources.latency", { count: m.latencyDays })}</p>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-black/50">{t("sources.lastDays", { count: DAYS })}</p>
      </div>
    </Modal>
  );
}

function AddSource({
  options,
  connectedIds,
  cities,
  onClose,
  onAdded,
}: {
  options: SourceDefinition[];
  connectedIds: string[];
  cities: { id: string; label: string }[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const [sourceId, setSourceId] = useState(options[0]?.id ?? "");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const source = options.find((s) => s.id === sourceId);
  // 値を作るのに要るデータ源で、まだつないでいないもの (つなげる候補の中にある)
  const missing = source ? source.dependsOn.filter((id) => !connectedIds.includes(id)) : [];
  const add = useMutation({
    mutationFn: () => connectSource(sourceId, settings),
    onSuccess: onAdded,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal title={t("sources.add")} onClose={onClose}>
      {options.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-black/50">{t("sources.allConnected")}</p>
      ) : (
        <form
          className="space-y-4 px-6 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs">{t("sources.source")}</span>
            <select
              className="input"
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setSettings({});
              }}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label[locale]} ({option.modeledOn})
                </option>
              ))}
            </select>
          </label>
          {source?.settings
            .filter((field) => field.type !== "seed")
            .map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-xs">{field.label[locale]}</span>
                {field.type === "city" ? (
                  <select
                    className="input"
                    required
                    value={settings[field.key] ?? ""}
                    onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                  >
                    <option value="" disabled />
                    {cities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type="date"
                    required
                    value={settings[field.key] ?? ""}
                    onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                  />
                )}
              </label>
            ))}
          {missing.length > 0 && (
            <p className="text-sm text-down">
              {t("sources.needs", { names: missing.map((id) => options.find((o) => o.id === id)?.label[locale] ?? id).join(", ") })}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="button-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="button-primary" disabled={add.isPending || missing.length > 0}>
              {t("sources.connect")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
