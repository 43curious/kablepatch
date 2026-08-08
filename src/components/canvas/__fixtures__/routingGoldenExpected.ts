import type { RoutedEdge } from '../geometry';

export const routingGoldenExpected: RoutedEdge[][] = [
  [
    {
      "id": "lane-a",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 100
        },
        {
          "x": 32,
          "y": 100
        },
        {
          "x": 32,
          "y": 152
        },
        {
          "x": 408,
          "y": 152
        },
        {
          "x": 408,
          "y": 100
        },
        {
          "x": 720,
          "y": 100
        }
      ],
      "path": "M0,100 H32 V152 H408 V100 H720",
      "crossings": []
    },
    {
      "id": "lane-b",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 180
        },
        {
          "x": 32,
          "y": 180
        },
        {
          "x": 32,
          "y": 248
        },
        {
          "x": 688,
          "y": 248
        },
        {
          "x": 688,
          "y": 180
        },
        {
          "x": 720,
          "y": 180
        }
      ],
      "path": "M0,180 H32 V248 H688 V180 H720",
      "crossings": []
    },
    {
      "id": "lane-c",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 260
        },
        {
          "x": 728,
          "y": 260
        },
        {
          "x": 728,
          "y": 72
        },
        {
          "x": 688,
          "y": 72
        },
        {
          "x": 688,
          "y": 60
        },
        {
          "x": 720,
          "y": 60
        }
      ],
      "path": "M0,260 H728 V72 H688 V60 H720",
      "crossings": []
    }
  ],
  [
    {
      "id": "c",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 100
        },
        {
          "x": 448,
          "y": 100
        },
        {
          "x": 448,
          "y": 220
        },
        {
          "x": 480,
          "y": 220
        }
      ],
      "path": "M0,100 H448 V220 H480",
      "crossings": []
    },
    {
      "id": "a",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 100
        },
        {
          "x": 32,
          "y": 100
        },
        {
          "x": 32,
          "y": 88
        },
        {
          "x": 480,
          "y": 88
        },
        {
          "x": 480,
          "y": 220
        }
      ],
      "path": "M0,100 H32 V88 H480 V220",
      "crossings": []
    },
    {
      "id": "b",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 100
        },
        {
          "x": 32,
          "y": 100
        },
        {
          "x": 32,
          "y": 220
        },
        {
          "x": 480,
          "y": 220
        }
      ],
      "path": "M0,100 H32 V220 H480",
      "crossings": []
    }
  ],
  [
    {
      "id": "manual",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 40
        },
        {
          "x": 32,
          "y": 40
        },
        {
          "x": 120,
          "y": 40
        },
        {
          "x": 120,
          "y": 20
        },
        {
          "x": 168,
          "y": 20
        },
        {
          "x": 168,
          "y": 300
        },
        {
          "x": 400,
          "y": 300
        },
        {
          "x": 488,
          "y": 300
        },
        {
          "x": 488,
          "y": 260
        },
        {
          "x": 520,
          "y": 260
        }
      ],
      "path": "M0,40 H120 V20 H168 V300 H488 V260 H520",
      "crossings": []
    },
    {
      "id": "vertical",
      "status": "routed",
      "points": [
        {
          "x": 360,
          "y": -80
        },
        {
          "x": 360,
          "y": -48
        },
        {
          "x": 528,
          "y": -48
        },
        {
          "x": 528,
          "y": 352
        },
        {
          "x": 360,
          "y": 352
        },
        {
          "x": 360,
          "y": 380
        }
      ],
      "path": "M360,-80 V-48 H528 V352 H360 V380",
      "crossings": []
    }
  ],
  [
    {
      "id": "a-loop",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 0
        },
        {
          "x": 32,
          "y": 0
        },
        {
          "x": 32,
          "y": -40
        },
        {
          "x": -40,
          "y": -40
        },
        {
          "x": -40,
          "y": 40
        },
        {
          "x": 32,
          "y": 40
        },
        {
          "x": 32,
          "y": 0
        },
        {
          "x": 0,
          "y": 0
        }
      ],
      "path": "M0,0 H32 V-40 H-40 V40 H32 V0 H0",
      "crossings": [
        {
          "point": {
            "x": 32,
            "y": 16
          },
          "withEdgeId": "b-exit",
          "segmentIndex": 5
        }
      ]
    },
    {
      "id": "b-exit",
      "status": "routed",
      "points": [
        {
          "x": 0,
          "y": 8
        },
        {
          "x": -32,
          "y": 8
        },
        {
          "x": -32,
          "y": 16
        },
        {
          "x": 72,
          "y": 16
        },
        {
          "x": 72,
          "y": 8
        },
        {
          "x": 100,
          "y": 8
        }
      ],
      "path": "M0,8 H-32 V16 H72 V8 H100",
      "crossings": [
        {
          "point": {
            "x": 32,
            "y": 16
          },
          "withEdgeId": "a-loop",
          "segmentIndex": 2
        }
      ]
    }
  ],
  [
    {
      "id": "impossible",
      "status": "unroutable",
      "points": [],
      "path": "",
      "crossings": []
    }
  ]
];
