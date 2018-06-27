import {Injectable} from '@angular/core';
import {WebDAV, Headers} from 'angular-webdav';
import {Observable} from 'rxjs/Observable';
import {of} from 'rxjs/observable/of';
import {RequestOptionsArgs} from 'angular-webdav/src/interfaces';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {XmlParser} from '@angular/compiler/src/ml_parser/xml_parser';
import {safeLoad} from 'js-yaml';
import {isObject} from 'util';

export interface WorkflowInput {
  [x: string]: object;
}

export interface Workflow {
  name: string;
  description: string;
  filename: string;
  inputs: any;
}

@Injectable()
export class WorkflowService {
  private webdav_url = 'http://localhost:8989/'; // 'https://webdav:aFxOaXFnyQV@145.100.59.204/'; // http://localhost:8989/';
  private webdav_dir = 'webdav/cwl/'; // 'webdav/cwl/';

  constructor(private httpClient: HttpClient) {

  }

  private parsePropfindResponse(content: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const elements = doc.getElementsByTagName('D:href');
    const output = [];

    for (let i = 0; i < elements.length; i++) {
      const filename = elements.item(i).innerHTML.trim();

      if (filename.toLocaleLowerCase().endsWith('.cwl')) {
        output.push(filename);
      }
    }

    return output;
  }

  private parseCwlFile(path:string, content: string): Workflow {
    const data = safeLoad(content);
    const inputs = [];

    if (data.inputs) {
      for (const key in data.inputs) {
        const value = data.inputs[key];

        if (isObject(value)) {
          inputs.push({
            id: key,
            name: (value.label || key).toString(),
            description: value.doc || '',
            type: (value.type || '').toString().toLowerCase(),
            default: value.default || null
          });
        } else {
          inputs.push({
            id: key,
            name: key,
            description: '',
            type: value,
            default: null
          })
        }
      }
    }

    return {
      name: data.label || path,
      description: data.doc || '',
      filename: path,
      inputs: inputs
    };
  }

  get getAllWorkflows(): Promise<Workflow[]> {
    const url = this.webdav_url + this.webdav_dir;
    const headers = {'Depth': '1'};
    console.log('requesting', url);

    return this.httpClient.request('PROPFIND', url, {headers: headers, responseType: 'text'})
      .toPromise()
      .then(v => {
      const paths = this.parsePropfindResponse(v);

      return Promise.all(paths.map(path => {
        const options = {responseType: 'text'};

        return this.httpClient.get(this.webdav_url + path, {responseType: 'text'})
          .map(content => {
          return this.parseCwlFile(path, content);
        }).toPromise();
      }));
    }).then(workflows => {
      return workflows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    });
  }
}
