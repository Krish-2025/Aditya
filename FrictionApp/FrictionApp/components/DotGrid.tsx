import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const SPACING = 20; // Grid spacing
const DOT_R = 1.5;  // Base radius

// 25 Prime numbers for polyrhythmic loop durations (in milliseconds)
// Ranging from ~2s to ~4.5s per full cycle
const PRIMES = [
  2003, 2111, 2207, 2309, 2411,
  2521, 2633, 2741, 2851, 2963,
  3079, 3187, 3301, 3413, 3527,
  3637, 3761, 3877, 3989, 4111,
  4219, 4337, 4447, 4561, 4673
];

function RandomLayer({
  pathData,
  primeDuration,
  delayOffset,
  isEmergency,
}: {
  pathData: string;
  primeDuration: number;
  delayOffset: number;
  isEmergency: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: primeDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }, delayOffset);

    return () => {
      clearTimeout(timeout);
      progress.stopAnimation();
    };
  }, [progress, primeDuration, delayOffset]);

  // Sine wave interpolation: 
  // 0 -> 0.05 (Dim)
  // 0.5 -> 0.5 (Bright)
  // 1 -> 0.05 (Dim)
  const opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.05, 0.5, 0.05],
    extrapolate: 'clamp',
  });

  if (!pathData) return null;

  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity }} pointerEvents="none">
      <Svg width={width} height={height}>
        {/* Render thousands of dots as exactly ONE optimized vector path */}
        <Path d={pathData} fill={isEmergency ? "rgba(255, 50, 50, 0.8)" : "rgba(255, 255, 255, 0.4)"} />
      </Svg>
    </Animated.View>
  );
}

// Helper to generate a perfect SVG circle path command
function generateCirclePath(cx: number, cy: number, r: number) {
  // Move to left edge, draw half circle right, draw half circle left
  return `M ${cx - r}, ${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 `;
}

export function DotGrid({ isEmergency = false }: { isEmergency?: boolean }) {
  const { width, height } = useWindowDimensions();

  // We pre-calculate implicitly where every dot goes and compile them into 25 string paths.
  // This physically destroys any possibility of seeing geometric macro-patterns
  // AND reduces the React Native node count from ~3000 <Circle>s down to exactly 25 <Path> strings.
  // This completely eliminates UI freezing during tab switching and button presses.
  const layers = useMemo(() => {
    // Prepare 25 empty strings
    const paths = Array.from({ length: 25 }, () => "");

    const cols = Math.ceil(width / SPACING);
    const rows = Math.ceil(height / SPACING);

    // Randomly append each dot's path command string into one of 25 layers
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const seed = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
        const binIndex = Math.floor(Math.abs(seed - Math.floor(seed)) * 25);

        const cx = c * SPACING;
        const cy = r * SPACING;
        paths[binIndex] += generateCirclePath(cx, cy, DOT_R);
      }
    }

    return paths.map((pathData, idx) => ({
      id: `layer-${idx}`,
      pathData,
      primeDuration: PRIMES[idx],
      delayOffset: (Math.abs(Math.sin(idx * 8.123)) * 4000),
    }));
  }, [width, height]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {layers.map(layer => (
        <RandomLayer
          key={layer.id}
          pathData={layer.pathData}
          primeDuration={layer.primeDuration}
          delayOffset={layer.delayOffset}
          isEmergency={isEmergency}
        />
      ))}
    </View>
  );
}
