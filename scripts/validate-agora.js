const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = require('agora-token');
require('dotenv').config();

const appId = process.env.AGORA_APP_ID;
const appCertificate = process.env.AGORA_APP_CERTIFICATE;

console.log('🔍 Validating Agora Credentials...\n');

// Check if credentials are set
if (!appId) {
  console.error('❌ AGORA_APP_ID is not set in environment variables');
  process.exit(1);
}

if (!appCertificate) {
  console.error('❌ AGORA_APP_CERTIFICATE is not set in environment variables');
  process.exit(1);
}

console.log(`App ID: ${appId}`);
console.log(`App Certificate: ${appCertificate.substring(0, 8)}...`);

// Test current timestamp
const currentTimestamp = Math.floor(Date.now() / 1000);
console.log(`Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`);

// Try to generate test tokens
try {
  const channelName = 'test_channel';
  const uid = 12345;
  const role = RtcRole.PUBLISHER;
  const expirationInSeconds = 3600;
  const privilegeExpiredTs = currentTimestamp + expirationInSeconds;

  console.log(`Token expiration timestamp: ${privilegeExpiredTs} (${new Date(privilegeExpiredTs * 1000).toISOString()})`);

  // Generate RTC token
  const rtcToken = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    role,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  console.log('\n🔧 RTC Token Test:');
  console.log(`✅ Successfully generated RTC token: ${rtcToken.substring(0, 20)}...`);
  console.log(`   Token length: ${rtcToken.length}`);
  
  // Generate RTM token
  const userId = 'test_user_123';
  const rtmToken = RtmTokenBuilder.buildToken(
    appId,
    appCertificate,
    userId,
    privilegeExpiredTs
  );

  console.log('\n🔧 RTM Token Test:');
  console.log(`✅ Successfully generated RTM token: ${rtmToken.substring(0, 20)}...`);
  console.log(`   Token length: ${rtmToken.length}`);

  // Validate timestamp consistency
  const timeDifference = privilegeExpiredTs - currentTimestamp;
  console.log(`\n⏰ Timestamp Validation:`);
  console.log(`   Current time: ${new Date().toISOString()}`);
  console.log(`   Token expires in: ${timeDifference} seconds (${Math.floor(timeDifference / 60)} minutes)`);
  console.log(`   Token expires at: ${new Date(privilegeExpiredTs * 1000).toISOString()}`);
  
  if (timeDifference > 0 && timeDifference <= 86400) { // Between 0 and 24 hours
    console.log('✅ Token expiration time is valid');
  } else {
    console.log('⚠️  Token expiration time seems unusual');
  }

  // Test different user ID formats
  console.log('\n🔧 User ID Format Tests:');
  
  // Test with UUID format
  const uuidUserId = '335b64ec-e7f2-401c-beca-86c05c4400bd';
  const uuidToken = RtmTokenBuilder.buildToken(
    appId,
    appCertificate,
    uuidUserId,
    privilegeExpiredTs
  );
  console.log(`✅ UUID user ID token: ${uuidToken.substring(0, 20)}...`);
  
  // Test with numeric UID conversion
  const numericUid = Math.abs(uuidUserId.split('-')[0].split('').reduce((hash, char) => {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return hash & hash;
  }, 0)) % 2147483647 || 1;
  
  const numericUidToken = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    numericUid,
    role,
    privilegeExpiredTs,
    privilegeExpiredTs
  );
  console.log(`✅ Numeric UID (${numericUid}) token: ${numericUidToken.substring(0, 20)}...`);
  
  console.log('\n🎉 All Agora token generation tests passed!');
  console.log('   Your Agora RTC setup should work correctly.');
  console.log('   Restart your backend and frontend services to apply changes.');
  
} catch (error) {
  console.error('❌ Failed to generate tokens with provided credentials:');
  console.error(`   Error: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  console.error();
  console.error('   Please verify your credentials are correct and try again.');
  process.exit(1);
} 