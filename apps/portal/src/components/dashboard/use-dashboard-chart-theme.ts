'use client';

import { useEffect, useState } from 'react';

import {
  readDashboardChartTheme,
  type DashboardChartTheme,
} from '@/components/dashboard/dashboard-chart-theme';

/** Keeps Apex chart colors in sync when theme / dark mode changes. */
export function useDashboardChartTheme(): DashboardChartTheme {
  const [theme, setTheme] = useState<DashboardChartTheme>(() => readDashboardChartTheme());

  useEffect(() => {
    setTheme(readDashboardChartTheme());
    const observer = new MutationObserver(() => {
      setTheme(readDashboardChartTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
}
