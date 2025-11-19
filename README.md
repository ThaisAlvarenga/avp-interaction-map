# avp-interaction-map

## Summary / Overview

On Meta Quest (controllers & hands), selection, pose, and button state are all exposed on persistent XRInputSources per hand (L/R), with targetRayMode: "tracked-pointer".

On Apple Vision Pro (Safari), hands are exposed as persistent XRInputSources (L/R) with joints and optional B0 state, but natural input selection is provided by additional transient XRInputSources with targetRayMode: "transient-pointer", hand === undefined, and gamepad.buttons[0] representing the pinch. These sources exist only during the pinch and are responsible for selectstart/select/selectend events.

Projects that seek to have cross-platform compatibility between Oculus and Apple Vision Pro must therefore map the inputs by:

- Iterating over all session.inputSources.

- Treating “hand” sources as pose/joint providers.

- Treating “transient-pointer” sources as selection/intent providers, especially on VisionOS.

## Analzing inputs
### 🥽 Oculus – Controllers

Case: Right trigger (select) with physical controller

Data read from inputs:
```
XR Inputs SEL[L:0 R:1] SQZ[L:0 R:0]
------------------
[R] ctrl | btn:B0 | ax:... | ray:tracked-pointer
[L] ctrl | btn:-  | ax:... | ray:tracked-pointer
```

There are two XRInputSources:

- [R] ctrl → right controller → gamepad.buttons[0].pressed === true

- [L] ctrl → left controller → no buttons pressed

TargetRayMode: "tracked-pointer" for both.

In this case, select events come from the right input, and you can map them cleanly to handedness R.

This is the “classic” WebXR controller model the spec was originally designed around.


### 🥽 Oculus – Hand Tracking

Case: Right hand pinch

HUD displays
```
XR Inputs SEL[L:0 R:1] SQZ[L:0 R:0]
------------------
[R] hand | btn:B0 | ax:... | pinch: value ✓ | ray:tracked-pointer
[L] hand | btn:-  | ax:... | pinch: value   | ray:tracked-pointer
```

There are again two XRInputSources:

- [R] hand with src.hand populated, targetRayMode: "tracked-pointer".
- [L] hand same as R.

The runtime exposes a gamepad-like ```btn:B0``` for the hand, corresponding to pinch.

The pinch distance you compute manually matches that so that B0 gets pressed when below some internal threshold.

In this case, select events come directly from the right-hand XRInputSource.

So on Quest world (controllers and hands):

> The same XRInputSource that gives me pose and/or joints also gives me events and button state.

### 👓 Apple Vision Pro – Hand Tracking + Natural Input

Now the interesting part.

Case: Right hand pinch on Apple Vision Pro (Safari)

HUD displays
```
XR Inputs SEL[L:0 R:1] SQZ[L:0 R:0]
------------------
[R] hand | btn:- | ax:... | pinch: value ✓ | ray:tracked-pointer
[L] hand | btn:-  | ax:... | pinch: value   | ray:tracked-pointer
[N] ctrl | btn:B0 | ax:... | pinch: n/a     | ray:transient-pointer
```

So there are three inputs:

- [R] hand – persistent
    - hand is present (joints)
    - targetRayMode: "tracked-pointer"
    - ```gamepad.buttons[0].pressed``` is absent when pinching

        > You see pinch distance + ✓ on this one

- [L] hand – persistent
    - Same structure
    > pinch distance is not ✓ on this one

- [N] ctrl – transient (this is the Natural Input transient-pointer)
- hand === undefined (no joints)
- handedness === "none" → code labels it N
- targetRayMode: "transient-pointer"
- ```gamepad.buttons[0].pressed``` reflects the select action for the duration of the pinch

The [WebKit Blog](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/) documetation explains that:

> Because the default WebXR input in visionOS is transient, that array is empty — until the user pinches… To differentiate this new input type, it has a targetRayMode of transient-pointer.”

So Apple’s WebXR implementation is both:

- Providing persistent hand XRInputSources with:
    - Joints
    - Pose
- Provide an additional ephemeral “controller-like” XRInputSource per pinch to satisfy the transient-pointer model so that it:
    -  is what actually drives ```selectstart / select / selectend``` events.
    -  uses ```targetRaySpace``` as the “gaze + hand influenced” ray.
    -  lives only for the duration of the pinch.

That’s why you see both:

- Hand entries ```[L] hand```, ```[R] hand``` with tracked-pointer rays and pinch distance.
- Plus an extra ```[N] ctrl | ray: transient-pointer``` that looks like a controller but is actually “natural input’s pinch ray”.

## Difference between AVP and Quest
Quest uses

- Controllers:
    - Pose + ray + buttons all on one ```XRInputSource``` per controller.

- Hands:
    - Pose + joints + synthetic buttons all on one ```XRInputSource``` per hand.

No extra transient source is required.

Vision Pro (Safari) uses:

- Persistent hands (for full hand tracking) that:
    - Provide pose + joints.
    - Do not own the “select” event in the natural input model (even if B0 exists).

- Transient pointer:
    - Created only while pinching.
    - Owns the select events.
    - Has ```targetRayMode: "transient-pointer"```.
    - Might have ```handedness: "none"``` or a side, depending on implementation.

This matches the blog’s model:

> “The hand inputs are supplied for pose information only and do not trigger any events… any transient-pointer inputs will appear further down the list.”

This provides a full image of the compatibility layer required.

# Recommendations and Considerations
 As of now (2025), AVPs only support WebXR on Safari. That means that any project that is built for cross-platform access between Oculus and AVP <mark> must be compatible with/ fully functioning in Safari </mark>. 

As a WebXR developer, you might be used to:
 - Assuming inputSources[0] and [1] are the “real” controllers.

- Assumig select events always come from a controller with handedness: L/R.

- Attaching objects / rays using the targetRaySpace or gripSpace of those first two only.

However, this can break on the Vision Pro since:

- ```[0]``` and ```[1]``` are the hands.
- The actual select source is ```[2]```, the natural input with targetRayMode: "transient-pointer" and handedness: "none".

A better cross-platform mental model would instead:
- Build a logical device view, not just “inputSources in order”:
- hands.left = any src.hand && src.handedness === 'left'
- hands.right = any src.hand && src.handedness === 'right'
- pointers = any src.targetRayMode === 'tracked-pointer' || src.targetRayMode === 'transient-pointer'

For selection (click-like actions):

- On Quest:

    - Use select events from controllers or hand XRInputSources.

    - Or src.gamepad.buttons[0] if you’re polling.

- On AVP:

    - Use select* events from transient-pointer sources (targetRayMode === 'transient-pointer').

    - Use their targetRaySpace for raycasting.

 HUD can show:

- For each input: type = src.hand ? 'hand' : 'ctrl', mode = src.targetRayMode, btns, pinch dist.

For manipulation near the hand (e.g., your wrist slider, grabbing objects):

- Oculus:
    - Use Hands
    - From src.hand + joints (frame.getJointPose).
    - Or grip space (on controllers) where available.

- On AVP:
    - hand XRInputSources are great for body-relative UIs (like your left wrist slider).
    - Transient-pointer is more for “intent” and ray-based selection.

For display & logging (what you’re doing now):

- Continue listing:

    - ```[L] han```

    - ```[R] hand``` 

    - ```[N] ctrl``` with ```ray: transient-pointer```

When you build logic (not just HUD), remember that ```[N]``` one is the true semantic “click” on AVP.