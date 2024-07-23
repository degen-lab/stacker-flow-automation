"use client";
import React, { ReactNode, useEffect, useState } from "react";

interface ClientOnlyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function ClientOnly({
  children,
  ...delegated
}: ClientOnlyProps): JSX.Element | null {
  const [hasMounted, setHasMounted] = useState<boolean>(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <div {...delegated}>{children}</div>;
}
