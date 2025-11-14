// Simple test script to validate the model configuration system
const { AVAILABLE_MODELS, getModelById, getModelsByProvider } = require('./dist/modelConfig');

console.log('🧪 Testing Model Configuration System\n');

console.log('📋 Available Models:');
AVAILABLE_MODELS.forEach(model => {
  console.log(`  ${model.provider}:${model.model} - ${model.name}`);
  console.log(`    Audio: ${model.audioFormat.input} (${model.audioFormat.sampleRate}Hz)`);
  console.log(`    Tools: ${model.supportsTools ? '✅' : '❌'} | VAD: ${model.supportsVAD ? '✅' : '❌'}`);
  if (model.maxSessionDuration) {
    console.log(`    Session Limit: ${model.maxSessionDuration} minutes`);
  }
  console.log('');
});

console.log('🔍 Testing Model Lookup:');
const testId = 'openai:gpt-4o-realtime-preview';
const foundModel = getModelById(testId);
console.log(`  Looking up "${testId}":`, foundModel ? '✅ Found' : '❌ Not Found');

console.log('\n🏷️ Models by Provider:');
console.log('  OpenAI Models:', getModelsByProvider('openai').length);

console.log('\n✅ Model configuration system test completed!');
