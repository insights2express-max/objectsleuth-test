// LIGHT LAB (test feature): "graded" shadows.
// Real shadows are crisp where an object touches a surface and get softer the farther the shadow
// falls (the sun and flames are not single points). Three.js's built-in filter softens every
// shadow by the same amount, so this file swaps in a filter that measures how far each shadow
// falls and softens it to match (known as "PCSS", percentage-closer soft shadows).
//
// How the sun light's shadow.radius is read (renderer must use THREE.BasicShadowMap):
//   radius > 0  → graded: penumbra = depth gap × radius (shadow-map units)
//   radius = 0  → plain: a small, even blur (about the old look)
// Point lights (the fire) get an 8-tap soft filter; their radius = blur in texels.
import * as THREE from '../../vendor/three/three.module.js';

const HELPERS = `
	float osIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 osVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float th = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( th ), sin( th ) ) * r;
	}
`;

const GRADED = `
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			if ( inFrustum && shadowCoord.z <= 1.0 ) {
				vec2 texel = vec2( 1.0 ) / shadowMapSize;
				float zR = shadowCoord.z;
				float phi = osIGN( gl_FragCoord.xy ) * PI2;
				if ( shadowRadius > 0.0 ) {
					// 1) how far above this point are the things casting the shadow?
					float sR = shadowRadius * 0.08, sum = 0.0, n = 0.0;
					for ( int i = 0; i < 12; i ++ ) {
						float d = texture2D( shadowMap, shadowCoord.xy + osVogel( i, 12, phi ) * sR ).r;
						if ( d < zR ) { sum += d; n += 1.0; }
					}
					if ( n > 0.0 ) {
						// 2) soften by that distance: crisp at contact, soft far away
						float pen = clamp( ( zR - sum / n ) * shadowRadius, 1.5 * texel.x, sR );
						float lit = 0.0;
						for ( int i = 0; i < 16; i ++ ) {
							lit += step( zR, texture2D( shadowMap, shadowCoord.xy + osVogel( i, 16, phi + 1.7 ) * pen ).r );
						}
						shadow = lit / 16.0;
					}
				} else {
					float lit = 0.0;
					for ( int i = 0; i < 5; i ++ ) {
						lit += step( zR, texture2D( shadowMap, shadowCoord.xy + osVogel( i, 5, phi ) * 1.5 * texel ).r );
					}
					shadow = lit / 5.0;
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
`;

// (exact Three.js r186 text, with its tab indents)
const POINT_OLD = '\t\t\tvec3 bd3D = normalize( lightToPosition );\n\t\t\tfloat depth = textureCube( shadowMap, bd3D ).r;\n'
  + '\t\t\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\t\t\tdepth = 1.0 - depth;\n\t\t\t#endif\n\t\t\tshadow = step( dp, depth );';
const POINT_NEW = `			vec3 bd3D = normalize( lightToPosition );
			vec3 tg = normalize( cross( bd3D, abs( bd3D.y ) > 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 ) ) );
			vec3 bt = cross( bd3D, tg );
			float ts = max( shadowRadius, 1.0 ) * 2.0 / shadowMapSize.x;
			float phi = osIGN( gl_FragCoord.xy ) * PI2;
			shadow = 0.0;
			for ( int i = 0; i < 8; i ++ ) {
				vec2 v = osVogel( i, 8, phi ) * ts;
				shadow += step( dp, textureCube( shadowMap, bd3D + tg * v.x + bt * v.y ).r );
			}
			shadow /= 8.0;`;

// Patches Three.js's shadow code once, before anything is drawn. Returns true if it worked.
export function installGradedShadows() {
  let src = THREE.ShaderChunk.shadowmap_pars_fragment;
  // the plain (non-PCF, non-VSM) getShadow is the last "#else" variant before the sun-light helper
  const start = src.indexOf('\t#else\n\t\tfloat getShadow( sampler2D shadowMap');
  const end = src.indexOf('\t#endif\n\t#if NUM_SUN_LIGHT_SHADOWS > 0\n\t\tfloat getSunShadow(');
  const pointOk = src.includes(POINT_OLD);
  if (start < 0 || end < 0 || !pointOk) {
    console.warn('ObjectSleuth: graded shadows not installed (Three.js shadow code changed).');
    return false;
  }
  src = src.slice(0, start) + '\t#else\n' + GRADED + src.slice(end);
  src = src.replace(POINT_OLD, POINT_NEW);
  src = src.replace('#ifdef USE_SHADOWMAP\n', '#ifdef USE_SHADOWMAP\n' + HELPERS);
  THREE.ShaderChunk.shadowmap_pars_fragment = src;
  return true;
}
