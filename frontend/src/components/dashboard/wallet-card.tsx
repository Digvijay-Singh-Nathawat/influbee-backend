'use client'

import { useState } from 'react'
import { PaymentModal } from '../google-pay/payment-modal'
import { WithdrawalModal } from '../google-pay/withdrawal-modal'

interface WalletCardProps {
  balance: number
  isInfluencer: boolean
}

export function WalletCard({ balance, isInfluencer }: WalletCardProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)

  const formatBalance = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100) // Convert paisa to rupees
  }

  const handlePaymentSuccess = (result: any) => {
    console.log('Payment successful:', result)
  }

  const handleWithdrawalSuccess = (result: any) => {
    console.log('Withdrawal successful:', result)
  }

  return (
    <>
      <div className={`balance-card text-white px-4 py-3 rounded-lg ${isInfluencer ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500'}`}>
        <div className="flex flex-col">
          <span className="text-xs opacity-90">
            {isInfluencer ? 'Earnings' : 'Balance'}
          </span>
          <span className="text-lg font-bold">
            {formatBalance(balance)}
          </span>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2 mt-2">
          {!isInfluencer && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-3 py-1 bg-white bg-opacity-20 text-white text-xs rounded-full hover:bg-opacity-30 transition-colors"
            >
              + Add Money
            </button>
          )}
          
          {isInfluencer && (
            <button
              onClick={() => setShowWithdrawalModal(true)}
              className="px-3 py-1 bg-white bg-opacity-20 text-white text-xs rounded-full hover:bg-opacity-30 transition-colors"
            >
              Withdraw
            </button>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
      />

      {/* Withdrawal Modal */}
      <WithdrawalModal
        isOpen={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        onSuccess={handleWithdrawalSuccess}
      />
    </>
  )
} 