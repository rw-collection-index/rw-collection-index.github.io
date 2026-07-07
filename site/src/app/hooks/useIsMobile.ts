import { useEffect, useState } from 'react';

export function useIsMobile() {
    // avoid a mobile/desktop layout swap and the resulting CLS once the effect below runs after first paint
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 818);

    useEffect(() => {
        const checkIsMobile = () => {
            setIsMobile(window.innerWidth < 818);
        };

        window.addEventListener('resize', checkIsMobile);

        // Cleanup
        return () => window.removeEventListener('resize', checkIsMobile);
    }, []);

    return isMobile;
} 