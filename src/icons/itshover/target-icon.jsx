import { forwardRef, useImperativeHandle, useCallback } from "react";
import { motion, useAnimate } from "motion/react";

const TargetIcon = forwardRef(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      if (!scope.current) return;
      try {
      animate(
        ".circle-outer",
        {
          scale: [1, 1.1, 1],
          opacity: [1, 0.7, 1],
        },
        {
          duration: 0.6,
          ease: "easeInOut",
        },
      );

      animate(
        ".circle-middle",
        {
          scale: [1, 1.15, 1],
          opacity: [1, 0.6, 1],
        },
        {
          duration: 0.6,
          ease: "easeInOut",
          delay: 0.1,
        },
      );

      await animate(
        ".circle-inner",
        {
          scale: [1, 1.3, 1],
          opacity: [1, 0.5, 1],
        },
        {
          duration: 0.6,
          ease: "easeInOut",
          delay: 0.2,
        },
      );
      } catch {
        /* scope can be null during unmount (Safari: root.querySelectorAll) */
      }
    }, [animate, scope]);

    const stop = useCallback(() => {
      if (!scope.current) return;
      try {
      animate(
        ".circle-outer, .circle-middle, .circle-inner",
        { scale: 1, opacity: 1 },
        { duration: 0.2, ease: "easeInOut" },
      );
      } catch {
        /* ignore unmounted scope */
      }
    }, [animate, scope]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
      >
        <motion.circle
          className="circle-outer"
          cx="12"
          cy="12"
          r="10"
          style={{ transformOrigin: "12px 12px" }}
        />

        <motion.circle
          className="circle-middle"
          cx="12"
          cy="12"
          r="6"
          style={{ transformOrigin: "12px 12px" }}
        />

        <motion.circle
          className="circle-inner"
          cx="12"
          cy="12"
          r="2"
          style={{ transformOrigin: "12px 12px" }}
        />
      </motion.svg>
    );
  },
);

TargetIcon.displayName = "TargetIcon";
export { TargetIcon };
