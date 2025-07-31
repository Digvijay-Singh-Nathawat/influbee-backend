'use client'

import { useState } from 'react'
import { GooglePayButton } from './google-pay-button'
import { walletApi } from '@/lib/api'
import { useWalletStore } from '@/lib/store/wallet'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (result: any) => void
}

export function PaymentModal({ isOpen, onClose, onSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [selectedMethod, setSelectedMethod] = useState<'GOOGLE_PAY' | 'CARD' | 'UPI'>('GOOGLE_PAY')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { fetchBalance } = useWalletStore()

  const predefinedAmounts = [10000, 20000, 50000, 100000, 200000, 500000] // in paisa

  const handleAmountSelect = (selectedAmount: number) => {
    setAmount(selectedAmount.toString())
    setError('')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount / 100)
  }

  const handlePaymentSuccess = (result: any) => {
    setSuccess(`Payment successful! Added ${formatCurrency(result.amount)} to your wallet.`)
    setError('')
    fetchBalance()
    onSuccess?.(result)
    
    // Close modal after 2 seconds
    setTimeout(() => {
      onClose()
      setSuccess('')
      setAmount('')
    }, 2000)
  }

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage)
    setSuccess('')
  }

  const handlePaymentCancel = () => {
    setError('')
    setSuccess('')
  }

  const handleCardPayment = async () => {
    if (!amount || parseInt(amount) < 10000) {
      setError('Minimum amount is ₹100')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      // Mock card payment for demo
      const mockPaymentData = {
        paymentMethodData: {
          description: 'Card ending in 1234',
          tokenizationData: {
            token: 'mock-card-token',
            type: 'PAYMENT_GATEWAY'
          },
          type: 'CARD',
          info: {
            cardNetwork: 'VISA',
            cardDetails: '1234'
          }
        }
      }

      const response = await walletApi.addMoney({
        amount: parseInt(amount),
        paymentData: mockPaymentData,
        paymentMethod: 'CARD'
      })

      if (response.data.success) {
        handlePaymentSuccess(response.data.data)
      } else {
        handlePaymentError(response.data.message || 'Payment failed')
      }
    } catch (error: any) {
      handlePaymentError(error.response?.data?.message || 'Payment failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUPIPayment = async () => {
    if (!amount || parseInt(amount) < 10000) {
      setError('Minimum amount is ₹100')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      // Mock UPI payment for demo
      const mockPaymentData = {
        paymentMethodData: {
          description: 'UPI Payment',
          tokenizationData: {
            token: 'mock-upi-token',
            type: 'PAYMENT_GATEWAY'
          },
          type: 'UPI',
          info: {
            upiId: 'user@paytm'
          }
        }
      }

      const response = await walletApi.addMoney({
        amount: parseInt(amount),
        paymentData: mockPaymentData,
        paymentMethod: 'UPI'
      })

      if (response.data.success) {
        handlePaymentSuccess(response.data.data)
      } else {
        handlePaymentError(response.data.message || 'Payment failed')
      }
    } catch (error: any) {
      handlePaymentError(error.response?.data?.message || 'Payment failed')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Add Money to Wallet</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Quick Amount Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Amount
          </label>
          <div className="grid grid-cols-3 gap-2">
            {predefinedAmounts.map((predefinedAmount) => (
              <button
                key={predefinedAmount}
                onClick={() => handleAmountSelect(predefinedAmount)}
                className={`p-2 text-sm rounded border ${
                  amount === predefinedAmount.toString()
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {formatCurrency(predefinedAmount)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or Enter Custom Amount (in paisa)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="10000"
            placeholder="Enter amount in paisa (min 10000)"
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {amount && `= ${formatCurrency(parseInt(amount) || 0)}`}
          </p>
        </div>

        {/* Payment Method Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="paymentMethod"
                value="GOOGLE_PAY"
                checked={selectedMethod === 'GOOGLE_PAY'}
                onChange={(e) => setSelectedMethod(e.target.value as any)}
                className="mr-2"
              />
              <span>Google Pay</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="paymentMethod"
                value="CARD"
                checked={selectedMethod === 'CARD'}
                onChange={(e) => setSelectedMethod(e.target.value as any)}
                className="mr-2"
              />
              <span>Credit/Debit Card</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="paymentMethod"
                value="UPI"
                checked={selectedMethod === 'UPI'}
                onChange={(e) => setSelectedMethod(e.target.value as any)}
                className="mr-2"
              />
              <span>UPI</span>
            </label>
          </div>
        </div>

        {/* Payment Button */}
        <div className="space-y-3">
          {selectedMethod === 'GOOGLE_PAY' && (
            <GooglePayButton
              amount={parseInt(amount) || 0}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={handlePaymentCancel}
              disabled={!amount || parseInt(amount) < 10000}
            />
          )}

          {selectedMethod === 'CARD' && (
            <button
              onClick={handleCardPayment}
              disabled={!amount || parseInt(amount) < 10000 || isProcessing}
              className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                !amount || parseInt(amount) < 10000 || isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isProcessing ? 'Processing...' : 'Pay with Card'}
            </button>
          )}

          {selectedMethod === 'UPI' && (
            <button
              onClick={handleUPIPayment}
              disabled={!amount || parseInt(amount) < 10000 || isProcessing}
              className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                !amount || parseInt(amount) < 10000 || isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {isProcessing ? 'Processing...' : 'Pay with UPI'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Minimum amount: ₹100 • All payments are secure and encrypted
        </p>
      </div>
    </div>
  )
} 