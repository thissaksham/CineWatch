import { getEnrichedMetadata, isSeasonOngoing } from '../src/lib/watchlist-shared';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        const tmdbId = 33982; // MasterChef India
        const { finalMetadata, initialStatus } = await getEnrichedMetadata(tmdbId, 'show', 'IN');
        
        console.log('Result of getEnrichedMetadata:');
        console.log('has_aired_finale =', finalMetadata.has_aired_finale);
        console.log('last_episode_to_air =', finalMetadata.last_episode_to_air);
        console.log('initialStatus =', initialStatus);

        const ongoing = isSeasonOngoing(finalMetadata, finalMetadata.last_episode_to_air?.season_number || 9);
        console.log('isSeasonOngoing(S9) =', ongoing);

        // also test splitsvilla 
        const splitsId = 7420; // assumed from overview "Splitsvilla"
        const { finalMetadata: splitsMeta, initialStatus: splitsStatus } = await getEnrichedMetadata(splitsId, 'show', 'IN');
        console.log('Result for Splitsvilla:');
        console.log('has_aired_finale =', splitsMeta.has_aired_finale);
        console.log('initialStatus =', splitsStatus);
        const splitsOngoing = isSeasonOngoing(splitsMeta, splitsMeta.last_episode_to_air?.season_number || 16);
        console.log('isSeasonOngoing(Splits S16) =', splitsOngoing);
        
    } catch (e) {
        console.error(e);
    }
}
run();
