import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

const mockWormholeConnect = vi.fn();

vi.mock('@wormhole-foundation/wormhole-connect', () => ({
    default: (props: any) => {
        mockWormholeConnect(props);
        return <div data-testid="wormhole-connect">Wormhole Connect</div>;
    },
    nttRoutes: () => [],
    WormholeConnect: (props: any) => {
        mockWormholeConnect(props);
        return <div data-testid="wormhole-connect">Wormhole Connect</div>;
    },
}));

describe('App', () => {
    beforeEach(() => {
        mockWormholeConnect.mockClear();
    });

    it('renders WormholeConnect component', () => {
        render(<App />);
        const wormholeConnect = screen.getByTestId('wormhole-connect');
        expect(wormholeConnect).toBeInTheDocument();
    });

    it('passes correct configuration to WormholeConnect', () => {
        render(<App />);

        expect(mockWormholeConnect).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    network: 'Mainnet',
                    chains: ['Ethereum', 'Solana', 'Base'],
                    tokens: expect.arrayContaining([
                        'BIOeth',
                        'BIOsol',
                        'BIObase',
                        'GROWeth',
                        'GROWsol',
                        'QBIOeth',
                        'QBIOsol',
                    ]),
                    ui: expect.objectContaining({
                        defaultInputs: {
                            fromChain: 'Ethereum',
                            toChain: 'Solana',
                        },
                        showHamburgerMenu: false,
                    }),
                }),
            })
        );
    });

    it('passes dark theme configuration', () => {
        render(<App />);

        expect(mockWormholeConnect).toHaveBeenCalledWith(
            expect.objectContaining({
                theme: expect.objectContaining({
                    mode: 'dark',
                }),
            })
        );
    });

    it('includes all required token configurations', () => {
        render(<App />);

        expect(mockWormholeConnect).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    tokensConfig: expect.objectContaining({
                        BIOsol: expect.objectContaining({
                            symbol: 'BIO',
                            nativeChain: 'Solana',
                            decimals: 9,
                        }),
                        BIOeth: expect.objectContaining({
                            symbol: 'BIO',
                            nativeChain: 'Ethereum',
                            decimals: 18,
                        }),
                        GROWeth: expect.objectContaining({
                            symbol: 'GROW',
                            nativeChain: 'Ethereum',
                        }),
                    }),
                }),
            })
        );
    });

    it('includes NTT routes configuration', () => {
        render(<App />);

        expect(mockWormholeConnect).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    routes: expect.any(Array),
                }),
            })
        );
    });
}); 