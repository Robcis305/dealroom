import { redirect } from 'next/navigation';

// Legacy email links built `/deals/<id>` before the path moved to
// `/workspace/<id>`. Keep old emails working by redirecting permanently.
export default async function LegacyDealRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/workspace/${id}`);
}
