import { Clapperboard } from 'lucide-react';
import styles from '../../../styles/components/Feedback.module.css';

interface FullPageLoaderProps {
  /** App name to display */
  appName?: string;
}

/**
 * Full Page Loader Component
 * Used during app initialization and authentication loading states.
 */
export const FullPageLoader = ({ appName = 'CineTrack' }: FullPageLoaderProps) => {
  return (
    <div className={styles.fullpageLoader}>
      <div className={styles.loaderIcon}>
        <Clapperboard size={32} color="var(--primary)" />
      </div>
      <h1 className={styles.loaderTitle}>{appName}</h1>
    </div>
  );
};

export default FullPageLoader;
