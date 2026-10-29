import { useEffect } from 'react';
import { acknowledgeSummaryJob, getSummaryJob, subscribeSummaryJob } from '@/state/summaryJob';
import { useToast } from '@/state/toast';

/** Says when the background weekly summary is ready (or failed), wherever the person is. */
export function SummaryNotice() {
  const toast = useToast();
  useEffect(
    () =>
      subscribeSummaryJob(() => {
        const job = getSummaryJob();
        if (job.status === 'done') toast.show('Tu resumen semanal está listo. Lo ves en Inicio.');
        else if (job.status === 'error') toast.show(job.message, 'error');
        else return;
        acknowledgeSummaryJob();
      }),
    [toast],
  );
  return null;
}
