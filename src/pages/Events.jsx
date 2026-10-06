import { Link } from 'react-router-dom'
import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GlareHover from '../components/GlareHover'
import LineSidebar from '../components/LineSidebar'
import { eventsByYear } from '../data/events'

gsap.registerPlugin(ScrollTrigger)

export default function Events() {
  const stripRef = useRef(null)
  const stageRef = useRef(null)
  const yearRefs = useRef({})
  const currentXRef = useRef(0)
  const maxXRef = useRef(0)
  const dragRef = useRef(null)
  const justDraggedRef = useRef(false)
  const [activeYear, setActiveYear] = useState(eventsByYear[0].id)
  const activeYearRef = useRef(activeYear)

  useEffect(() => {
    activeYearRef.current = activeYear
  }, [activeYear])

  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || window.innerHeight < 600
    }
    return false
  })

  // Always start at top. Prevents arriving from bottom of previous page while
  // desktop mode locks vertical scroll (overflow hidden), which would otherwise
  // leave the top of the strip "covered" and content stuck near the footer.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [])

  const updateActiveFromPosition = useCallback(() => {
    const strip = stripRef.current
    const stageEl = stageRef.current
    if (!strip || !stageEl || isSmallScreen) return

    const viewLeft = -currentXRef.current
    let bestId = activeYearRef.current
    let bestLeft = -Infinity

    eventsByYear.forEach((section) => {
      const el = yearRefs.current[section.id]
      if (!el) return
      const left = el.offsetLeft
      if (left <= viewLeft + 1 && left > bestLeft) {
        bestLeft = left
        bestId = section.id
      }
    })

    if (bestId && bestId !== activeYearRef.current) {
      setActiveYear(bestId)
    }
  }, [isSmallScreen])

  useLayoutEffect(() => {
    if (isSmallScreen) return
    const positionInitial = () => {
      const firstId = eventsByYear[0]?.id
      const targetEl = firstId ? yearRefs.current[firstId] : null
      const strip = stripRef.current
      const stageEl = stageRef.current
      if (!targetEl || !strip || !stageEl) return
      const offset = targetEl.offsetLeft
      let targetX = -offset
      const maxX = -(strip.scrollWidth - stageEl.offsetWidth + 100)
      targetX = Math.max(maxX, Math.min(0, targetX))
      gsap.set(strip, { x: targetX })
      currentXRef.current = targetX
      updateActiveFromPosition()
    }
    requestAnimationFrame(positionInitial)
  }, [isSmallScreen, updateActiveFromPosition])

  // Build flat horizontal sequence: year blocks + event blocks
  const horizontalSlides = []
  eventsByYear.forEach((section) => {
    horizontalSlides.push({ type: 'year', year: section.year, id: section.id })
    section.items.forEach((ev) => {
      horizontalSlides.push({ type: 'event', ...ev, yearId: section.id })
    })
  })

  // Lock page scroll on desktop + wheel-driven horizontal scrub (no up/down)
  useEffect(() => {
    if (isSmallScreen) return

    const strip = stripRef.current
    const stage = stageRef.current
    if (!strip || !stage) return

    // Ensure we are at true top before locking (handles any late reflow or nav timing)
    window.scrollTo(0, 0)

    // Prevent any vertical page movement
    const prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    const updateMax = () => {
      maxXRef.current = -(strip.scrollWidth - stage.offsetWidth + 100)
    }
    updateMax()

    const handleResize = () => {
      updateMax()
      // Re-apply current x after resize so transformed strip + children heights reflow correctly
      // (ensures images using calc(100% ...) or h-full resize properly when y changes)
      gsap.set(strip, { x: currentXRef.current })
    }
    window.addEventListener('resize', handleResize)

    // Wheel controls horizontal only. No page scroll. Supports left/right (deltaX) swipes too.
    const handleWheel = (e) => {
      e.preventDefault()
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      let next = currentXRef.current - (raw * 0.9)
      next = Math.max(maxXRef.current, Math.min(0, next))
      currentXRef.current = next
      gsap.to(strip, {
        x: next,
        duration: 0.35,
        ease: 'power1.out',
        overwrite: true,
        onUpdate: updateActiveFromPosition,
      })
    }
    stage.addEventListener('wheel', handleWheel, { passive: false })

    // Pointer drag / swipe for left-right horizontal navigation (trackpad/touch)
    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return
      gsap.killTweensOf(strip)
      dragRef.current = {
        startX: e.clientX,
        startPos: currentXRef.current,
        moved: false,
        id: e.pointerId,
        lastX: e.clientX,
        lastT: performance.now(),
        v: 0,
      }
    }
    const onPointerMove = (e) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      if (!drag.moved && Math.abs(dx) > 5) {
        drag.moved = true
        try { stage.setPointerCapture(drag.id) } catch {}
      }
      if (!drag.moved) return
      const now = performance.now()
      const dt = Math.max(now - drag.lastT, 1)
      drag.v = (e.clientX - drag.lastX) / dt
      drag.lastX = e.clientX
      drag.lastT = now
      let next = drag.startPos + dx
      next = Math.max(maxXRef.current, Math.min(0, next))
      currentXRef.current = next
      gsap.set(strip, { x: next })
      updateActiveFromPosition()
    }
    const onPointerEnd = () => {
      const drag = dragRef.current
      if (!drag) return
      const didMove = drag.moved
      if (didMove) {
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 120)
      }
      const dragId = drag.id
      dragRef.current = null
      if (!didMove) return
      try { stage.releasePointerCapture(dragId) } catch {}
      // momentum fling
      let projected = currentXRef.current + (drag.v * 220)
      projected = Math.max(maxXRef.current, Math.min(0, projected))
      currentXRef.current = projected
      gsap.to(strip, {
        x: projected,
        duration: 0.65,
        ease: 'power2.out',
        onUpdate: updateActiveFromPosition,
      })
    }
    stage.addEventListener('pointerdown', onPointerDown)
    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerup', onPointerEnd)
    stage.addEventListener('pointercancel', onPointerEnd)
    stage.addEventListener('pointerleave', onPointerEnd)

    // Left-align the first year block in the viewport (text to left, robust to different card widths)
    const positionToInitialYear = () => {
      const firstId = eventsByYear[0]?.id
      const targetEl = firstId ? yearRefs.current[firstId] : null
      if (targetEl && strip) {
        const offset = targetEl.offsetLeft
        // Left-align the element
        let targetX = -offset
        targetX = Math.max(maxXRef.current, Math.min(0, targetX))
        gsap.set(strip, { x: targetX })
        currentXRef.current = targetX
        updateActiveFromPosition()
      }
    }
    // Use rAF to ensure refs and layout are ready
    requestAnimationFrame(positionToInitialYear)

    return () => {
      document.documentElement.style.overflow = prevOverflow
      window.removeEventListener('resize', handleResize)
      stage.removeEventListener('wheel', handleWheel)
      stage.removeEventListener('pointerdown', onPointerDown)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerup', onPointerEnd)
      stage.removeEventListener('pointercancel', onPointerEnd)
      stage.removeEventListener('pointerleave', onPointerEnd)
    }
  }, [isSmallScreen, updateActiveFromPosition])

  // Small screen detection + vertical fallback on small screens
  useEffect(() => {
    const check = () => setIsSmallScreen(window.innerWidth < 768 || window.innerHeight < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Desktop: tween strip to the year. Mobile: scroll to vertical section
  const jumpToYear = (id) => {
    setActiveYear(id)

    if (isSmallScreen) {
      const el = document.getElementById(`m-year-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const targetEl = yearRefs.current[id]
    const strip = stripRef.current
    const stageEl = stageRef.current
    if (!targetEl || !strip || !stageEl) return

    const offset = targetEl.offsetLeft
    // Left-align the year block (text at left, not centered in viewport)
    let targetX = -offset
    targetX = Math.max(maxXRef.current, Math.min(0, targetX))

    currentXRef.current = targetX
    gsap.to(strip, {
      x: targetX,
      duration: 0.7,
      ease: 'power2.inOut',
      onUpdate: updateActiveFromPosition,
    })
  }

  // Continuously track position during/after wheel movements so bold/active in sidebar updates
  useEffect(() => {
    if (isSmallScreen) return

    let rafId
    const tick = () => {
      updateActiveFromPosition()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isSmallScreen, updateActiveFromPosition])

  // Mobile: use IntersectionObserver on year sections to keep sidebar active in sync while scrolling vertically
  useEffect(() => {
    if (!isSmallScreen) return

    const observer = new IntersectionObserver(
      (entries) => {
        // pick the one with highest intersection ratio, or the top one
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const id = visible.target.id.replace('m-year-', '')
          if (id && id !== activeYearRef.current) {
            setActiveYear(id)
          }
        }
      },
      { threshold: [0.1, 0.5, 0.9] }
    )

    // observe after mount
    const timer = setTimeout(() => {
      eventsByYear.forEach((s) => {
        const el = document.getElementById(`m-year-${s.id}`)
        if (el) observer.observe(el)
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [isSmallScreen])

  return (
    <div className={`flex flex-col bg-white ${!isSmallScreen ? 'flex-1 overflow-hidden min-h-0' : ''}`}>
      {/* Main stage — flex-1 takes remaining space. No vertical scroll on page. */}
      <div
        ref={stageRef}
        className={`relative ${!isSmallScreen ? 'flex-1 overflow-hidden min-h-0' : ''}`}
        style={!isSmallScreen ? { touchAction: 'none' } : undefined}
      >
        {!isSmallScreen ? (
          /* Desktop: horizontal strip. Pictures scale to fit screen + caption + linebar */
            <div
              ref={stripRef}
              className="flex h-full gap-8 md:gap-16 pl-[5vw] pt-4 will-change-transform"
              onClickCapture={(e) => {
                if (justDraggedRef.current) {
                  justDraggedRef.current = false
                  e.stopPropagation()
                  e.preventDefault()
                }
              }}
            >
            {(() => {
              let yearIdx = 0;
              return horizontalSlides.map((slide) => {
                if (slide.type === 'year') {
                  const isFirst = yearIdx === 0;
                  yearIdx++;
                  return (
                    <div
                      key={`y-${slide.id}`}
                      ref={(el) => {
                        if (el) yearRefs.current[slide.id] = el
                      }}
                      className={`flex-shrink-0 w-[min(46vw,460px)] h-full flex items-center ${isFirst ? 'justify-start' : 'justify-center ml-16 md:ml-24'} select-none`}
                      style={{ minHeight: 120 }}
                    >
                      <div className="pl-4 md:pl-8 text-[58px] md:text-[72px] font-semibold tracking-[-3.5px] leading-[0.86] text-[#09346A]">
                        {slide.year.split('–').map((p, i) => (
                          <div key={i}>{p.trim()}</div>
                        ))}
                      </div>
                    </div>
                  )
                }

                // Event block: controlled image height, group pushed to bottom to stick near linebar
                return (
                  <div
                    key={slide.slug}
                    className="flex-shrink-0 w-[min(92vw,920px)] h-full flex flex-col justify-end"
                    style={{ minHeight: 140 }}
                  >
                    <Link to={`/events/${slide.slug}`} className="block group">
                      <div className="relative overflow-hidden rounded-xl shadow-sm" style={{ height: 'min(65vh, 560px)' }}>
                        <img
                          src={slide.img}
                          alt={slide.title}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                        />
                       </div>

                      <div className="mt-1 pl-1 min-h-[42px]">
<div className="text-[13px] font-semibold tracking-[-0.2px] leading-tight transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1 group-hover:font-bold">
                           {slide.title}
                         </div>
<div className="mt-0.5 text-[9px] text-[#09346A]/70 space-y-[1px]">
                           <div className="transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1 group-hover:font-bold">📅 {slide.date}</div>
                           <div className="transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1 group-hover:font-bold">📍 {slide.location}</div>
                         </div>
                      </div>
                    </Link>
                  </div>
                )
              })
            })()}
          </div>
        ) : (
          /* Mobile vertical */
          <div className="px-[45px] pt-4 pb-12">
            {eventsByYear.map((section) => (
              <div key={section.id} id={`m-year-${section.id}`} className="mb-10">
                <div className="text-center text-[48px] font-semibold tracking-[-2.2px] leading-none text-[#09346A] mb-5">
                  {section.year.split('–').map((p, i) => <div key={i}>{p.trim()}</div>)}
                </div>

                {section.items.map((ev) => (
                  <Link key={ev.slug} to={`/events/${ev.slug}`} className="block group mb-10">
                    <div className="relative w-full rounded-xl overflow-hidden shadow-sm" style={{ height: 'min(58vh, 420px)' }}>
                      <GlareHover
                        width="100%"
                        height="100%"
                        background="transparent"
                        borderRadius="20px"
                        borderColor="transparent"
                        glareColor="#ffffff"
                        glareOpacity={0.28}
                        glareAngle={-26}
                        glareSize={240}
                        transitionDuration={600}
                        playOnce={false}
                      >
                         <img src={ev.img} alt={ev.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.1]" />
                      </GlareHover>
                    </div>
                    <div className="mt-3">
                      <div className="text-[18px] font-semibold tracking-[-0.2px] transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1 group-hover:font-bold">{ev.title}</div>
<div className="mt-1 text-[13px] text-[#09346A]/70">
                          <span className="transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1">📅 {ev.date}</span><br />
                          <span className="transition-all duration-200 group-hover:underline group-hover:decoration-1 group-hover:underline-offset-1">📍 {ev.location}</span>
                        </div>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linebar always visible at bottom */}
      <div className="border-t border-[#09346A]/10 bg-white/95 backdrop-blur-sm px-[45px] py-1 min-h-[42px] flex-shrink-0">
        <div>
          <LineSidebar
            items={eventsByYear.map(y => y.year)}
            orientation="horizontal"
            spread={true}
            showIndex={false}
            showMarker={true}
            markerLength={15}
            markerGap={2}
            tickScale={0.5}
            itemGap={24}
            minorTicks={20}
            accentColor="#09346A"
            textColor="#09346A"
            markerColor="#09346A"
            fontSize={0.62}
            maxShift={2}
            smoothing={80}
            defaultActive={eventsByYear.findIndex(y => y.id === activeYear)}
            onItemClick={(idx) => {
              const y = eventsByYear[idx]
              if (y) jumpToYear(y.id)
            }}
          />
        </div>
      </div>
    </div>
  )
}
