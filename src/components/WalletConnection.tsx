'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import styles from './WalletConnection.module.css'

export function WalletConnection() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready =
          mounted && authenticationStatus !== 'loading'
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated')

        if (!connected) {
          return (
            <div className={styles.container}>
              <button
                type="button"
                onClick={openConnectModal}
                className={styles.connectButton}
                disabled={!ready}
              >
                {ready ? 'Connect wallet' : 'Connecting…'}
              </button>
            </div>
          )
        }

        return (
          <div className={styles.connectedContainer}>
            <span className={styles.connectedBadge}>
              {account.displayName}
            </span>
            <button
              type="button"
              onClick={openAccountModal}
              className={styles.disconnectButton}
            >
              Disconnect
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
