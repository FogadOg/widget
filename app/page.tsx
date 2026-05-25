import LocaleHomePage from "./[locale]/page";

export default function RootPage() {
  return <LocaleHomePage params={Promise.resolve({ locale: 'en' })} />;
}
