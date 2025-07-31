'use client'

import { useState } from 'react'
import { walletApi } from '@/lib/api'
import { useWalletStore } from '@/lib/store/wallet'

interface WithdrawalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (result: any) => void
}

export function WithdrawalModal({ isOpen, onClose, onSuccess }: WithdrawalModalProps) {
  const [amount, setAmount] = useState('')
  const [withdrawalMethod, setWithdrawalMethod] = useState<'BANK_TRANSFER' | 'UPI'>('BANK_TRANSFER')
  const [bankDetails, setBankDetails] = useState({
    accountNumber: '',
    ifscCode: '',
    accountHolderName: '',
    bankName: '',
    upiId: ''
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { balance, fetchBalance } = useWalletStore()

  const predefinedAmounts = [50000, 100000, 200000, 500000, 1000000] // in paisa

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

  const handleWithdrawal = async () => {
    const withdrawalAmount = parseInt(amount)
    
    if (!withdrawalAmount || withdrawalAmount < 50000) {
      setError('Minimum withdrawal amount is ₹500')
      return
    }

    if (withdrawalAmount > balance) {
      setError('Insufficient balance')
      return
    }

    if (withdrawalMethod === 'BANK_TRANSFER') {
      if (!bankDetails.accountNumber || !bankDetails.ifscCode || !bankDetails.accountHolderName) {
        setError('Please fill all bank details')
        return
      }
    } else if (withdrawalMethod === 'UPI') {
      if (!bankDetails.upiId) {
        setError('Please enter UPI ID')
        return
      }
    }

    setIsProcessing(true)
    setError('')

    try {
      const response = await walletApi.withdrawal({
        amount: withdrawalAmount,
        withdrawalMethod,
        bankDetails: withdrawalMethod === 'BANK_TRANSFER' ? {
          accountNumber: bankDetails.accountNumber,
          ifscCode: bankDetails.ifscCode,
          accountHolderName: bankDetails.accountHolderName,
          bankName: bankDetails.bankName,
        } : {
          upiId: bankDetails.upiId
        }
      })

      if (response.data.success) {
        setSuccess(`Withdrawal successful! ${formatCurrency(withdrawalAmount)} has been requested.`)
        fetchBalance()
        onSuccess?.(response.data.data)
        
        // Close modal after 3 seconds
        setTimeout(() => {
          onClose()
          setSuccess('')
          setAmount('')
          setBankDetails({
            accountNumber: '',
            ifscCode: '',
            accountHolderName: '',
            bankName: '',
            upiId: ''
          })
        }, 3000)
      } else {
        setError(response.data.message || 'Withdrawal failed')
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Withdrawal failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBankDetailsChange = (field: string, value: string) => {
    setBankDetails(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Withdraw Money</h2>
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

        {/* Current Balance */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-800">
            Current Balance: <span className="font-semibold">{formatCurrency(balance)}</span>
          </p>
        </div>

        {/* Quick Amount Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Amount
          </label>
          <div className="grid grid-cols-2 gap-2">
            {predefinedAmounts.map((predefinedAmount) => (
              <button
                key={predefinedAmount}
                onClick={() => handleAmountSelect(predefinedAmount)}
                disabled={predefinedAmount > balance}
                className={`p-2 text-sm rounded border ${
                  predefinedAmount > balance
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : amount === predefinedAmount.toString()
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
            min="50000"
            max={balance}
            placeholder="Enter amount in paisa (min 50000)"
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {amount && `= ${formatCurrency(parseInt(amount) || 0)}`}
          </p>
        </div>

        {/* Withdrawal Method Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Withdrawal Method
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="withdrawalMethod"
                value="BANK_TRANSFER"
                checked={withdrawalMethod === 'BANK_TRANSFER'}
                onChange={(e) => setWithdrawalMethod(e.target.value as any)}
                className="mr-2"
              />
              <span>Bank Transfer</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="withdrawalMethod"
                value="UPI"
                checked={withdrawalMethod === 'UPI'}
                onChange={(e) => setWithdrawalMethod(e.target.value as any)}
                className="mr-2"
              />
              <span>UPI</span>
            </label>
          </div>
        </div>

        {/* Bank Details Form */}
        {withdrawalMethod === 'BANK_TRANSFER' && (
          <div className="mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Bank Details</h3>
            <input
              type="text"
              placeholder="Account Holder Name"
              value={bankDetails.accountHolderName}
              onChange={(e) => handleBankDetailsChange('accountHolderName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Account Number"
              value={bankDetails.accountNumber}
              onChange={(e) => handleBankDetailsChange('accountNumber', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="IFSC Code"
              value={bankDetails.ifscCode}
              onChange={(e) => handleBankDetailsChange('ifscCode', e.target.value.toUpperCase())}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Bank Name (Optional)"
              value={bankDetails.bankName}
              onChange={(e) => handleBankDetailsChange('bankName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* UPI Details Form */}
        {withdrawalMethod === 'UPI' && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">UPI Details</h3>
            <input
              type="text"
              placeholder="UPI ID (e.g., user@paytm)"
              value={bankDetails.upiId}
              onChange={(e) => handleBankDetailsChange('upiId', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Withdrawal Button */}
        <button
          onClick={handleWithdrawal}
          disabled={!amount || parseInt(amount) < 50000 || parseInt(amount) > balance || isProcessing}
          className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
            !amount || parseInt(amount) < 50000 || parseInt(amount) > balance || isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-red-500 text-white hover:bg-red-600'
          }`}
        >
          {isProcessing ? 'Processing Withdrawal...' : 'Withdraw Money'}
        </button>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Minimum withdrawal: ₹500 • Processing time: 1-2 business days
        </p>
      </div>
    </div>
  )
} 