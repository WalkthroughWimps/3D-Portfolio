# Header and GLB interaction follow-ups

## Animated double-click transform resets implemented

General settings now provide an Animate resets toggle plus Move reset speed and Rotation reset speed (0.25–3×, default 1×). The shared GLB controls animate middle-button pan resets and right-button view resets with eased motion. The Start-style middle-button default-focus reset uses the move speed; ordinary focus clicks retain their own timing. Graphics retains its arc path and scales only reset duration. The About cube still trues the nearest visible face upright, now on a bounded explicit slerp; its normal drag follow-through and automatic face snap retain their prior response.

The animation toggle and reduced-motion preference make double-click resets immediate. New gestures interrupt an in-progress reset. Automated numerical and interaction checks cover reset midpoint/end, opposite viewing directions, cancellation, and preference parsing. Manual browser checks remain for pointer-capture ordering, perceived easing, and layout of the General controls across pages; browser interaction was unavailable in this task.
