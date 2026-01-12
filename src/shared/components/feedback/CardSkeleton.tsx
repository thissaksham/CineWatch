import styles from '../../../styles/components/Feedback.module.css';

interface CardSkeletonProps {
    /** Number of skeleton cards to show. Default is 10. */
    count?: number;
}

/**
 * Card Skeleton Component
 * Renders a grid of translucent pulsing placeholders for media cards.
 */
export const CardSkeleton = ({ count = 10 }: CardSkeletonProps) => {
    return (
        <div className={styles.skeletonGrid}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={styles.cardSkeleton} />
            ))}
        </div>
    );
};

export default CardSkeleton;
