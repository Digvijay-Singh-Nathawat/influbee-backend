'use client'

import { useEffect, useState } from 'react'
import { walletApi } from '@/lib/api'
import { useWalletStore } from '@/lib/store/wallet'

interface GooglePayButtonProps {
  amount: number
  onSuccess?: (result: any) => void
  onError?: (error: string) => void
  onCancel?: () => void
  disabled?: boolean
}

declare global {
  interface Window {
    google: any
    googlePayClient: any
  }
}

export function GooglePayButton({
  amount,
  onSuccess,
  onError,
  onCancel,
  disabled = false
}: GooglePayButtonProps) {
  const [isGooglePayReady, setIsGooglePayReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { fetchBalance } = useWalletStore()

  useEffect(() => {
    loadGooglePayScript()
  }, [])

  const loadGooglePayScript = () => {
    if (window.google && window.google.payments) {
      initializeGooglePay()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://pay.google.com/gp/p/js/pay.js'
    script.async = true
    script.onload = initializeGooglePay
    document.head.appendChild(script)
  }

  const initializeGooglePay = async () => {
    try {
      const googlePayClient = new window.google.payments.api.PaymentsClient({
        environment: 'TEST' // Change to 'PRODUCTION' for production
      })

      const isReadyToPayRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX']
          }
        }]
      }

      const response = await googlePayClient.isReadyToPay(isReadyToPayRequest)
      
      if (response.result) {
        setIsGooglePayReady(true)
        window.googlePayClient = googlePayClient
      }
    } catch (error) {
      console.error('Error initializing Google Pay:', error)
      onError?.('Failed to initialize Google Pay')
    }
  }

  const handleGooglePayButtonClick = async () => {
    if (!window.googlePayClient || isLoading) return

    setIsLoading(true)

    try {
      const paymentDataRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX']
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: 'example',
              gatewayMerchantId: 'gatewayMerchantId'
            }
          }
        }],
        merchantInfo: {
          merchantId: 'BCR2DN6T7PO4XAJG',
          merchantName: 'Agora Communication Platform'
        },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: (amount / 100).toFixed(2),
          currencyCode: 'INR',
          countryCode: 'IN'
        }
      }

      const paymentData = await window.googlePayClient.loadPaymentData(paymentDataRequest)
      
      // Process payment through backend
      const response = await walletApi.addMoney({
        amount,
        paymentData,
        paymentMethod: 'GOOGLE_PAY'
      })

      if (response.data.success) {
        onSuccess?.(response.data.data)
        fetchBalance() // Refresh balance
      } else {
        onError?.(response.data.message || 'Payment failed')
      }
    } catch (error: any) {
      console.error('Google Pay error:', error)
      
      if (error.statusCode === 'CANCELED') {
        onCancel?.()
      } else {
        onError?.(error.message || 'Payment failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!isGooglePayReady) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 rounded-lg">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
        <span className="ml-2 text-gray-600">Loading Google Pay...</span>
      </div>
    )
  }

  return (
    <button
      onClick={handleGooglePayButtonClick}
      disabled={disabled || isLoading}
      className={`
        relative w-full bg-black text-white py-3 px-6 rounded-lg font-medium
        transition-all duration-200 flex items-center justify-center
        ${disabled || isLoading 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:bg-gray-800 active:bg-gray-900'
        }
      `}
    >
      {isLoading ? (
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
          Processing...
        </div>
      ) : (
        <div className="flex items-center">
          <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              fill="currentColor"
            />
          </svg>
          Pay with Google Pay
        </div>
      )}
    </button>
  )
} 