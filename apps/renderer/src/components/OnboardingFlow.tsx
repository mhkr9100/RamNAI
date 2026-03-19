import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  BrainCircuit, 
  Box, 
  ArrowRight, 
  ArrowLeft, 
  LoaderCircle, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  Key 
} from 'lucide-react';
import { Button, Card, Input, Badge, Divider } from './ui';
import { RamanIcon } from './RamanIcon';

export interface OnboardingFlowProps {
  onComplete: (profile: { name: string; email: string }) => Promise<void>;
  isCheckingRuntime?: boolean | undefined;
  runtimeAvailable?: boolean | undefined;
}

export function OnboardingFlow({ 
  onComplete, 
  isCheckingRuntime = false, 
  runtimeAvailable = false 
}: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [keys, setKeys] = useState({ openai: '', anthropic: '' });

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setStep((prev) => prev + newDirection);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await onComplete(profile);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isProfileValid = profile.name.trim().length > 0 && profile.email.includes('@');

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  const renderStepIndicator = () => (
    <div className="flex justify-center gap-2 mt-12 z-10">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === step ? 'w-6 bg-[#7c5cfc]' : 'w-1.5 bg-white/20'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-0 overflow-hidden">
      <div className="w-full max-w-lg px-6 flex flex-col justify-center min-h-[500px] relative">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full"
          >
            {step === 0 && (
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="mb-8 relative"
                >
                  <div className="absolute inset-0 bg-[#7c5cfc] blur-[40px] opacity-20 rounded-full" />
                  <RamanIcon className="w-24 h-24 text-[#7c5cfc] drop-shadow-[0_0_15px_rgba(124,92,252,0.5)] relative z-10" />
                </motion.div>
                
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl font-bold text-white mb-3"
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  Welcome to RamN AI
                </motion.h1>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/60 mb-10 text-lg"
                >
                  Let&apos;s set up your workspace
                </motion.p>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="w-full"
                >
                  <Button variant="brand" size="lg" fullWidth onClick={() => paginate(1)} iconRight={<ArrowRight size={18} />}>
                    Get Started
                  </Button>
                </motion.div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col">
                <Button variant="ghost" size="sm" className="self-start mb-6 -ml-3 text-white/50" onClick={() => paginate(-1)} icon={<ArrowLeft size={16} />}>
                  Back
                </Button>
                
                <h2 className="text-2xl font-bold text-white mb-2">Set up your profile</h2>
                <p className="text-white/50 text-sm mb-8">This is used to personalize your workspace. Stored locally.</p>
                
                <div className="flex justify-center mb-8">
                  <div className="w-20 h-20 rounded-full bg-[#7c5cfc]/20 border-2 border-[#7c5cfc]/30 flex items-center justify-center text-2xl font-bold text-[#c4b5fd]">
                    {profile.name.trim() ? profile.name.trim().charAt(0).toUpperCase() : '?'}
                  </div>
                </div>

                <div className="space-y-4 mb-10">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50 pl-1">Your Name</label>
                    <Input 
                      placeholder="e.g. Raman" 
                      value={profile.name} 
                      onChange={(e: any) => setProfile({ ...profile, name: e.target.value })} 
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50 pl-1">Email Address</label>
                    <Input 
                      type="email"
                      placeholder="you@example.com" 
                      value={profile.email} 
                      onChange={(e: any) => setProfile({ ...profile, email: e.target.value })} 
                    />
                  </div>
                </div>

                <Button 
                  variant="brand" 
                  size="lg" 
                  fullWidth 
                  onClick={() => paginate(1)} 
                  disabled={!isProfileValid}
                  iconRight={<ArrowRight size={18} />}
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col">
                <Button variant="ghost" size="sm" className="self-start mb-6 -ml-3 text-white/50" onClick={() => paginate(-1)} icon={<ArrowLeft size={16} />}>
                  Back
                </Button>
                
                <h2 className="text-2xl font-bold text-white mb-2">Connect your runtime</h2>
                <p className="text-white/50 text-sm mb-8">RamN AI works best with a local engine like Ollama.</p>
                
                <div className="p-5 bg-surface-3 border border-white/[0.08] rounded-2xl mb-6 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                        <Box size={16} className="text-white/70" />
                      </div>
                      <h3 className="font-semibold text-white/90">Local Engine (Ollama)</h3>
                    </div>
                    {isCheckingRuntime ? (
                      <Badge variant="default" icon={<LoaderCircle size={12} className="animate-spin" />}>Checking...</Badge>
                    ) : runtimeAvailable ? (
                      <Badge variant="success" icon={<Check size={12} />}>Ollama running</Badge>
                    ) : (
                      <Badge variant="warning">Not detected</Badge>
                    )}
                  </div>
                  
                  {!isCheckingRuntime && !runtimeAvailable && (
                    <div className="mt-3 text-sm text-white/60 bg-surface-4 rounded-xl p-3 border border-white/[0.04]">
                      <p className="mb-2">We couldn't detect Ollama running. To use local models, please install it.</p>
                      <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-brand-light hover:text-brand-subtle underline decoration-[#7c5cfc]/30 underline-offset-2">Download Ollama</a>
                    </div>
                  )}
                </div>

                <div className="h-px bg-white/[0.08] my-6 w-full" />
                
                <div className="space-y-4 mb-10">
                  <div className="flex items-center gap-2 mb-2">
                    <Key size={14} className="text-white/40" />
                    <h3 className="text-sm font-semibold text-white/80">Cloud Providers (Optional)</h3>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/40 pl-1">OpenAI API Key</label>
                    <Input 
                      type="password"
                      placeholder="sk-..." 
                      value={keys.openai} 
                      onChange={(e: any) => setKeys({ ...keys, openai: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/40 pl-1">Anthropic API Key</label>
                    <Input 
                      type="password"
                      placeholder="sk-ant-..." 
                      value={keys.anthropic} 
                      onChange={(e: any) => setKeys({ ...keys, anthropic: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="lg" className="flex-1" onClick={() => paginate(1)}>
                    Skip for now
                  </Button>
                  <Button variant="brand" size="lg" className="flex-1" onClick={() => paginate(1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center text-center">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6, type: "spring" }}
                  className="w-24 h-24 rounded-full bg-[#7c5cfc]/20 border-4 border-[#7c5cfc]/30 flex items-center justify-center mb-8 relative"
                >
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-dashed border-[#7c5cfc]/40"
                  />
                  <CheckCircle2 size={40} className="text-[#c4b5fd]" />
                </motion.div>
                
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl font-bold text-white mb-3"
                >
                  You're all set!
                </motion.h2>
                
                <motion.p 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/60 mb-10"
                >
                  Your workspace is ready. Here are a few things you can do next:
                </motion.p>
                
                <motion.div 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-col gap-3 w-full mb-10 text-left"
                >
                  <div className="flex items-start gap-3 bg-surface-3 border border-white/[0.08] p-4 rounded-xl">
                    <Sparkles className="text-[#a78bfa] mt-0.5" size={16} />
                    <div>
                      <h4 className="text-white/90 text-sm font-medium">Create your first Agent</h4>
                      <p className="text-white/50 text-xs mt-1">Design an AI persona tailored to your needs.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-surface-3 border border-white/[0.08] p-4 rounded-xl">
                    <BrainCircuit className="text-[#a78bfa] mt-0.5" size={16} />
                    <div>
                      <h4 className="text-white/90 text-sm font-medium">Setup a Group Chat</h4>
                      <p className="text-white/50 text-xs mt-1">Watch multiple agents collaborate on a task.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-surface-3 border border-white/[0.08] p-4 rounded-xl">
                    <Shield className="text-[#a78bfa] mt-0.5" size={16} />
                    <div>
                      <h4 className="text-white/90 text-sm font-medium">Explore Settings</h4>
                      <p className="text-white/50 text-xs mt-1">Configure models, parameters, and system prompts.</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="w-full"
                >
                  <Button 
                    variant="brand" 
                    size="lg" 
                    fullWidth 
                    onClick={handleComplete} 
                    loading={isSubmitting}
                  >
                    Start using RamN AI
                  </Button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {renderStepIndicator()}
      </div>
    </div>
  );
}
