export default function Head({ params }: { params: { token: string } }) {
  const manifestHref = `/cn/${params.token}/manifest.webmanifest`;
  return (
    <>
      <title>Cổng chủ nhà - Huỳnh Gia</title>
      <meta name="theme-color" content="#f97316" />
      <link rel="manifest" href={manifestHref} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="HG Chủ Nhà" />
    </>
  );
}
