import {Injectable} from '@angular/core';
import {WebDAV, Headers} from 'angular-webdav';
import {Observable} from 'rxjs/Observable';
import {of} from 'rxjs/observable/of';
import {RequestOptionsArgs} from 'angular-webdav/src/interfaces';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {XmlParser} from '@angular/compiler/src/ml_parser/xml_parser';
import {safeLoad} from 'js-yaml';
import {isArray, isObject} from 'util';

export interface WorkflowInput {
  id: string;
  description: string;
  type: string;
  default: any;
}

export interface Workflow {
  name: string;
  description: string;
  filename: string;
  inputs: WorkflowInput[];
}

@Injectable()
export class WorkflowService {
  private webdav_url = 'http://localhost:8989'; // 'https://webdav:aFxOaXFnyQV@145.100.59.204/'; // http://localhost:8989/';
  private webdav_dir = '/webdav/'
  private cwl_dir = 'cwl/';

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

  private parseCwlFile(path: string, content: string): Workflow {
    const data = safeLoad(content);
    let dataInputs = data.inputs;
    const inputs = [];

    if (!dataInputs) {
      dataInputs = {};
    }

    if (isArray(dataInputs)) {
      const newData = {};

      for (const key in dataInputs) {
        newData[dataInputs[key].id] = dataInputs[key];
      }

      dataInputs = newData;
    }

    if (dataInputs) {
      for (const key in dataInputs) {
        const value = dataInputs[key];

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
            type: value.toLowerCase(),
            default: null
          });
        }
      }
    }

    if (path.startsWith(this.webdav_dir)) {
      path = path.substr(this.webdav_dir.length);
    }

    return {
      name: data.label,
      description: data.doc || '',
      filename: path,
      inputs: inputs
    };
  }

  get getAllWorkflows(): Promise<Workflow[]> {
    const url = this.webdav_url + this.webdav_dir + this.cwl_dir;
    const headers = {'Depth': '1'};

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
      return workflows
        .filter(x => x.name)
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    });
  }
}
