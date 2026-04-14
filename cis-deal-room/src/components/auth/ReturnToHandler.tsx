'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Reads the returnTo sessionStorage entry set by the login page's returnTo
 * capture. If present and valid same-origin path, navigates there and
 * clears the entry. Otherwise no-op.
 */
export function ReturnToHandler() {
  const router = useRouter();
  useEffect(() => {
    const returnTo = sessionStorage.getItem('loginReturnTo');
    if (returnTo && returnTo.startsWith('/')) {
      sessionStorage.removeItem('loginReturnTo');
      router.replace(returnTo);
    }
  }, [router]);
  return null;
}
