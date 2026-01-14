import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import styles from './SmartPillButton.module.css';

interface SmartPillButtonProps {
    viewMode: string;
    seriesStatus: string;
    onViewModeChange: (mode: string) => void;
    onSeriesStatusChange: (status: string) => void;
}

const ContentFinished = () => (
    <>
        <span>Finished</span>
        <span className={styles['sub-text']}>on-going</span>
    </>
);

const ContentOngoing = () => (
    <>
        <span className={styles['sub-text']}>finished</span>
        <span>On-going</span>
    </>
);

export const SmartPillButton = ({
    viewMode,
    seriesStatus,
    onViewModeChange,
    onSeriesStatusChange
}: SmartPillButtonProps) => {

    const slots = ['Unwatched', 'Watching', 'Watched', 'Dropped'];

    const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

    const activeIndex = slots.indexOf(viewMode);

    const updateHighlight = useCallback(() => {
        if (activeIndex !== -1 && optionRefs.current[activeIndex]) {
            const element = optionRefs.current[activeIndex]!;
            const width = element.offsetWidth;
            const left = element.offsetLeft;
            setHighlightStyle({ width: `${width}px`, left: `${left}px` });
        }
    }, [activeIndex]);

    useLayoutEffect(() => {
        // Defer highlight update to ensure DOM is fully measured
        // Increased delay to allow flex layout (space-around) to settle
        const timeoutId = setTimeout(() => {
            updateHighlight();
        }, 50);

        window.addEventListener('resize', updateHighlight);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updateHighlight);
        };
    }, [activeIndex, seriesStatus, updateHighlight]);

    const handleClick = (index: number) => {
        const selectedSlot = slots[index];

        if (index === 0) {
            if (viewMode === 'Unwatched') {
                const newStatus = seriesStatus === 'Finished' ? 'Ongoing' : 'Finished';
                onSeriesStatusChange(newStatus);
            } else {
                onViewModeChange('Unwatched');
            }
        } else {
            onViewModeChange(selectedSlot);
        }
    };

    return (
        <div className={styles['pill-button']}>
            <div
                ref={el => { optionRefs.current[0] = el; }}
                className={`${styles['pill-button-selection']} ${viewMode === 'Unwatched' ? styles['pill-button-selection_active'] : ''}`}
                onClick={() => handleClick(0)}
            >
                <div className={styles['calibration-container']}>
                    <div className={styles['calibration-dummy']}>
                        <ContentFinished />
                    </div>
                    <div className={styles['calibration-dummy']}>
                        <ContentOngoing />
                    </div>

                    <div className={styles['calibration-visible']}>
                        {seriesStatus === 'Finished' ? <ContentFinished /> : <ContentOngoing />}
                    </div>
                </div>
            </div>

            <div
                ref={el => { optionRefs.current[1] = el; }}
                className={`${styles['pill-button-selection']} ${viewMode === 'Watching' ? styles['pill-button-selection_active'] : ''}`}
                onClick={() => handleClick(1)}
            >
                Watching
            </div>

            <div
                ref={el => { optionRefs.current[2] = el; }}
                className={`${styles['pill-button-selection']} ${viewMode === 'Watched' ? styles['pill-button-selection_active'] : ''}`}
                onClick={() => handleClick(2)}
            >
                Watched
            </div>

            <div
                ref={el => { optionRefs.current[3] = el; }}
                className={`${styles['pill-button-selection']} ${viewMode === 'Dropped' ? styles['pill-button-selection_active'] : ''}`}
                onClick={() => handleClick(3)}
            >
                Dropped
            </div>

            <div className={styles['pill-button-highlight']} style={highlightStyle}></div>
        </div>
    );
};
