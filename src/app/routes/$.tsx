import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export function ErrorBoundary() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p>{t("notFound")}</p>
      <Link to="/" className="text-sm font-semibold hover:underline">
        {t("common.back")}
      </Link>
    </div>
  );
}

export default function NotFound() {
  return null;
}
